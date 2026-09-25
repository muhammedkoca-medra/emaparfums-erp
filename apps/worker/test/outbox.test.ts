import { randomUUID } from "node:crypto";
import { createPrismaClient, type Db, emit } from "@atelier/db";
import { type DomainEvent } from "@atelier/shared";
import { type Worker } from "bullmq";
import { pino } from "pino";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { startEventWorker } from "../src/event-worker.js";
import { type HandlerMap } from "../src/handlers/index.js";
import { dispatchBatch } from "../src/outbox-dispatcher.js";
import { createQueues, redisConnection } from "../src/queues.js";
import { redisUrl, workerTestDbUrl } from "./env.js";

const log = pino({ level: "silent" });
const prefix = `atelier-test-${randomUUID().slice(0, 8)}`;
const connection = redisConnection(redisUrl());
const opts = { batchSize: 100, maxAttempts: 3, jobAttempts: 2, jobBackoffMs: 10 };

let prisma: Db;
let queues: ReturnType<typeof createQueues>;
let worker: Worker | undefined;

beforeAll(async () => {
  prisma = createPrismaClient(workerTestDbUrl());
  queues = createQueues(connection, prefix);
});
afterEach(async () => {
  await worker?.close();
  worker = undefined;
});
afterAll(async () => {
  await queues.events.obliterate({ force: true });
  await queues.dlq.obliterate({ force: true });
  await Promise.all([queues.events.close(), queues.dlq.close()]);
  await prisma.$disconnect();
});

const emitEvent = (event: DomainEvent) => prisma.$transaction((tx) => emit(tx, event));

async function waitFor<T>(fn: () => Promise<T | undefined | null | false>, timeoutMs = 10_000): Promise<T> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > until) throw new Error("zaman aşımı");
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe("outbox-dispatcher (F0-07)", () => {
  it("PENDING olayı kuyruğa aktarır ve DISPATCHED yapar; ikinci taramada tekrar aktarmaz", async () => {
    const id = await emitEvent({ type: "system.ping", pingId: randomUUID(), requestedById: "u1" });
    const first = await dispatchBatch(prisma, queues.events, log, opts);
    expect(first.dispatched).toBeGreaterThanOrEqual(1);

    const row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("DISPATCHED");
    expect(row.dispatchedAt).not.toBeNull();
    const job = await queues.events.getJob(id);
    expect(job?.data).toMatchObject({ eventId: id, type: "system.ping" });

    const second = await dispatchBatch(prisma, queues.events, log, opts);
    expect(second.dispatched).toBe(0);
  });

  it("eşzamanlı iki tarama aynı olayı iki kez almaz (SKIP LOCKED)", async () => {
    const ids = await Promise.all(
      Array.from({ length: 20 }, () => emitEvent({ type: "stock.changed", itemId: randomUUID() })),
    );
    const [a, b] = await Promise.all([
      dispatchBatch(prisma, queues.events, log, { ...opts, batchSize: 15 }),
      dispatchBatch(prisma, queues.events, log, { ...opts, batchSize: 15 }),
    ]);
    const rest = await dispatchBatch(prisma, queues.events, log, opts);
    expect(a.dispatched + b.dispatched + rest.dispatched).toBe(20);
    const rows = await prisma.outboxEvent.findMany({ where: { id: { in: ids } } });
    expect(rows.every((r) => r.status === "DISPATCHED")).toBe(true);
  });
});

describe("olay işleyici", () => {
  it("olay outbox'tan işleyiciye ulaşır", async () => {
    const received: string[] = [];
    const map: HandlerMap = {
      "system.ping": [{ name: "test", handle: async (e) => void received.push(e.pingId) }],
    };
    worker = startEventWorker({ connection, prefix, prisma, log, dlq: queues.dlq, handlers: map });
    const pingId = randomUUID();
    await emitEvent({ type: "system.ping", pingId, requestedById: "u1" });
    await dispatchBatch(prisma, queues.events, log, opts);
    await waitFor(async () => received.includes(pingId));
  });

  it("tüm denemeler başarısız olunca olay ölü mektup kuyruğuna taşınır", async () => {
    let calls = 0;
    const map: HandlerMap = {
      "lot.quarantined": [
        {
          name: "failing",
          handle: async () => {
            calls++;
            throw new Error("işleyici hatası");
          },
        },
      ],
    };
    worker = startEventWorker({ connection, prefix, prisma, log, dlq: queues.dlq, handlers: map });
    const id = await emitEvent({ type: "lot.quarantined", lotId: randomUUID(), reason: "test" });
    await dispatchBatch(prisma, queues.events, log, opts);
    const dead = await waitFor(() => queues.dlq.getJob(id));
    expect(dead.data).toMatchObject({
      eventId: id,
      type: "lot.quarantined",
      failedReason: "işleyici hatası",
      attemptsMade: 2,
    });
    expect(calls).toBe(2);
  });
});
