import { type DomainEvent } from "@atelier/shared";
import { type Tx } from "./client.js";

/**
 * Transactional outbox (docs/01-mimari.md §İlkeler 2).
 * Olay, iş kaydıyla AYNI transaction içinde yazılır; worker'daki outbox-dispatcher kuyruğa aktarır.
 *
 *   await prisma.$transaction(async (tx) => {
 *     const lot = await tx.lot.update(...);
 *     await emit(tx, { type: "lot.released", lotId: lot.id });
 *   });
 */
export async function emit(tx: Tx, event: DomainEvent): Promise<string> {
  const { aggregate, aggregateId } = aggregateOf(event);
  const row = await tx.outboxEvent.create({
    data: { type: event.type, aggregate, aggregateId, payload: event as object },
    select: { id: true },
  });
  return row.id;
}

/** "lot.released" → aggregate "lot", aggregateId = olaydaki ilk "...Id" alanı. */
export function aggregateOf(event: DomainEvent): { aggregate: string; aggregateId: string } {
  const aggregate = event.type.split(".")[0]!;
  const idEntry = Object.entries(event).find(([k, v]) => k.endsWith("Id") && typeof v === "string");
  if (!idEntry) throw new Error(`Olayda kimlik alanı yok: ${event.type}`);
  return { aggregate, aggregateId: idEntry[1] as string };
}
