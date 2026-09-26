import { checkConsistency, type Db, emit, integrationLogSink } from "@atelier/db";
import { addMonths, computeSalesLock, periodLabel } from "@atelier/shared";
import { buildContext, createDefaultRegistry, type FxCapabilities, type IntegrationAdapter, MemoryLogSink, resolveCredentials } from "@atelier/integrations";
import { type ConnectionOptions, Queue, Worker } from "bullmq";
import { type Logger } from "pino";

const registry = createDefaultRegistry();

/**
 * Zamanlanmış işler (docs/03-moduller/stok.md STK-10 ve sonraki fazlardaki gece işleri).
 * BullMQ iş zamanlayıcısı: birden çok worker çalışsa da iş tek kez tetiklenir.
 */
export const SCHEDULED_QUEUE = "scheduled";

export const SCHEDULES = [
  // STK-10: her gece 03:00 (İstanbul) stok tutarlılık kontrolü
  { id: "stock-consistency", pattern: "0 3 * * *" },
  // F2-17: her iş günü 15:45 TCMB kuru çek (mock)
  { id: "fx-refresh", pattern: "45 15 * * 1-5" },
  // KAL-05: her gece 03:30 uyum belgesi süre kontrolü
  { id: "compliance-expiry", pattern: "30 3 * * *" },
  // ODM-08 · SDK-05: her gece 04:00 abonelik tahsilatı ve kutu oluşturma
  { id: "subscription-billing", pattern: "0 4 * * *" },
] as const;

export type ScheduledJobName = (typeof SCHEDULES)[number]["id"];

/** STK-10: hareket toplamları ile bakiyeleri karşılaştırır; fark varsa alarm logu yazar. */
export async function runStockConsistency(prisma: Db, log: Logger) {
  const mismatches = await checkConsistency(prisma);
  if (mismatches.length > 0) {
    log.error(
      { job: "stock-consistency", count: mismatches.length, mismatches: mismatches.slice(0, 50) },
      "ALARM: stok bakiyesi hareketlerle tutarsız",
    );
  } else {
    log.info({ job: "stock-consistency" }, "stok tutarlılık kontrolü: fark yok");
  }
  return mismatches;
}

/** F2-17: TCMB kurunu (mock) çeker ve bugün için arşivler. quote+date benzersiz → idempotent. */
export async function runFxRefresh(prisma: Db, log: Logger) {
  const integration = await prisma.integration.findUnique({ where: { code: "FX_TCMB" } });
  const credentials = resolveCredentials(integration?.credentialsRef);
  const { adapter } = registry.resolve<IntegrationAdapter & FxCapabilities>("FX_TCMB", { credentials }, "mock");
  const ctx = buildContext({ integrationId: integration?.id ?? "FX_TCMB", credentials, sink: integration ? integrationLogSink(prisma) : new MemoryLogSink(), direction: "IN" });
  const rates = await adapter.latestRates(ctx);
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  for (const [quote, rate] of Object.entries(rates)) {
    await prisma.fxRate.upsert({ where: { quote_date: { quote, date } }, update: { rate }, create: { quote, rate, date, base: "TRY", source: "FX_TCMB" } });
  }
  log.info({ job: "fx-refresh", quotes: Object.keys(rates) }, "kur güncellendi");
  return Object.keys(rates).length;
}

/**
 * KAL-05: uyum belgelerinin geçerliliğini kontrol eder.
 *  - validUntil geçmiş VALID belge → EXPIRED; ürün durumu yeniden hesaplanır (KAL-04 → SALES_LOCKED),
 *    compliance.changed yayılır.
 *  - 60 gün içinde dolacaklar uyarı olarak loglanır (Task modeli yok; görev yerine alarm logu).
 */
export async function runComplianceExpiry(prisma: Db, log: Logger, now = new Date()) {
  const soon = new Date(now.getTime() + 60 * 86_400_000);
  // 1) Süresi dolanları EXPIRED yap ve ürün durumunu güncelle.
  const overdue = await prisma.complianceDocument.findMany({ where: { status: "VALID", validUntil: { lt: now } }, select: { id: true, productId: true } });
  const touched = new Set<string>();
  for (const d of overdue) {
    await prisma.$transaction(async (tx) => {
      await tx.complianceDocument.update({ where: { id: d.id }, data: { status: "EXPIRED" } });
      const prod = await tx.product.findUniqueOrThrow({ where: { id: d.productId }, select: { status: true } });
      const docs = await tx.complianceDocument.findMany({ where: { productId: d.productId }, select: { type: true, status: true } });
      const next = computeSalesLock(prod.status, docs);
      if (next !== prod.status) await tx.product.update({ where: { id: d.productId }, data: { status: next } });
      await emit(tx, { type: "compliance.changed", productId: d.productId });
    });
    touched.add(d.productId);
  }
  // 2) 60 gün içinde dolacaklar için uyarı.
  const upcoming = await prisma.complianceDocument.count({ where: { status: "VALID", validUntil: { gte: now, lte: soon } } });
  if (upcoming > 0) log.warn({ job: "compliance-expiry", upcoming }, "60 gün içinde geçerliliği dolacak uyum belgesi var");
  if (overdue.length > 0) log.warn({ job: "compliance-expiry", expired: overdue.length, products: touched.size }, "süresi dolan belgeler EXPIRED yapıldı; ürünler kilitlendi");
  return { expired: overdue.length, upcoming, productsLocked: touched.size };
}

/**
 * ODM-08 · SDK-05: vadesi gelen abonelikleri tahsil eder (mock: başarılı), dönem kutusunu oluşturur
 * (numune ürün önerisiyle) ve sonraki tahsilat tarihini iler. Gerçek tahsilat kayıtlı kart token'ıyla
 * ağa çıkışta; başarısızlıkta 1/3/7. gün yeniden deneme (BILLING_RETRY_DAYS) sonra PAST_DUE.
 */
export async function runSubscriptionBilling(prisma: Db, log: Logger, now = new Date()) {
  const due = await prisma.subscription.findMany({ where: { status: "ACTIVE", nextBillingAt: { lte: now } }, include: { plan: true } });
  let billed = 0;
  // Numune önerisi: aktif mamullerden ilk N (gerçekte satış/koku çeşitliliğine göre).
  const sampleProducts = await prisma.product.findMany({ where: { status: "ACTIVE" }, select: { id: true }, take: 12 });
  for (const sub of due) {
    const period = periodLabel(now);
    const exists = await prisma.subscriptionBox.findFirst({ where: { subscriptionId: sub.id, period } });
    if (exists) continue;
    const productIds = sampleProducts.slice(0, sub.plan.samplesPerBox).map((p) => p.id);
    await prisma.$transaction(async (tx) => {
      await tx.subscriptionBox.create({ data: { subscriptionId: sub.id, period, productIds } });
      await tx.subscription.update({ where: { id: sub.id }, data: { nextBillingAt: addMonths(sub.nextBillingAt, sub.plan.intervalMonths) } });
    });
    billed++;
  }
  if (billed > 0) log.info({ job: "subscription-billing", billed }, "abonelik kutuları oluşturuldu");
  return { billed };
}

export async function startScheduler(input: {
  connection: ConnectionOptions;
  prefix: string;
  prisma: Db;
  log: Logger;
}) {
  const queue = new Queue(SCHEDULED_QUEUE, { connection: input.connection, prefix: input.prefix });
  for (const s of SCHEDULES) {
    await queue.upsertJobScheduler(s.id, { pattern: s.pattern, tz: "Europe/Istanbul" }, { name: s.id });
  }
  const worker = new Worker(
    SCHEDULED_QUEUE,
    async (job) => {
      switch (job.name as ScheduledJobName) {
        case "stock-consistency":
          return { mismatches: (await runStockConsistency(input.prisma, input.log)).length };
        case "fx-refresh":
          return { quotes: await runFxRefresh(input.prisma, input.log) };
        case "compliance-expiry":
          return runComplianceExpiry(input.prisma, input.log);
        case "subscription-billing":
          return runSubscriptionBilling(input.prisma, input.log);
        default:
          input.log.warn({ job: job.name }, "bilinmeyen zamanlanmış iş");
      }
    },
    { connection: input.connection, prefix: input.prefix, concurrency: 1 },
  );
  worker.on("failed", (job, err) =>
    input.log.error({ job: job?.name, err: err.message }, "zamanlanmış iş başarısız"),
  );
  return { queue, worker };
}
