import { channelStockQty, type Db, integrationLogSink, type Tx } from "@atelier/db";
import { buildContext, createDefaultRegistry, type IntegrationAdapter, type MarketplaceCapabilities, MemoryLogSink, resolveCredentials } from "@atelier/integrations";
import { type EventHandler } from "./index.js";

/**
 * Pazaryeri otomatik senkronu (docs/02 §Olaylar · e-ticaret dinler). Yalnızca ACTIVE ilanı olan
 * pazaryeri kanallarına gönderilir; dış çağrılar adaptör üzerinden (kural 8, testte mock).
 *  - stock.changed      → satılabilir adet (serbest stok − tampon) itilir.
 *  - price.changed      → kanal fiyat listesindeki (yoksa genel) güncel fiyat itilir.
 *  - product.updated    → içerik alanı değiştiyse ilan güncellenir; durum değiştiyse stok yeniden itilir.
 *  - compliance.changed → ürün yeniden satışa açıldıysa gerçek stok itilir (kilitlenmede 0 ayrı işleyicide).
 */
const registry = createDefaultRegistry();

/**
 * Kanalın adaptörü: kanala bağlı entegrasyon kaydının kodu (yoksa kanal kodu). Kayıtlı olmayan
 * entegrasyonda null — o kanal atlanır, olay diğer kanallara işlenmeye devam eder (sonsuz yeniden deneme yok).
 */
async function adapterFor(prisma: Db, channel: { code: string; integration: { code: string } | null }) {
  const code = channel.integration?.code ?? channel.code;
  if (!registry.has(code)) return null;
  const integration = await prisma.integration.findUnique({ where: { code } });
  const credentials = resolveCredentials(integration?.credentialsRef);
  const { adapter } = registry.resolve<IntegrationAdapter & MarketplaceCapabilities>(code, { credentials }, "mock");
  const ctx = buildContext({
    integrationId: integration?.id ?? code,
    credentials,
    settings: (integration?.settings as Record<string, unknown>) ?? {},
    sink: integration ? integrationLogSink(prisma) : new MemoryLogSink(),
    direction: "OUT",
  });
  return { adapter, ctx };
}

/** Ürünün ACTIVE pazaryeri ilanları. */
function activeListings(prisma: Db, productId: string) {
  return prisma.channelListing.findMany({
    where: { productId, status: "ACTIVE", channel: { type: "MARKETPLACE" } },
    select: { id: true, channelId: true, channel: { select: { code: true, integration: { select: { code: true } } } } },
  });
}

async function pushStockForProduct(prisma: Db, productId: string): Promise<number> {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, sku: true, itemId: true, status: true } });
  if (!product) return 0;
  const listings = await activeListings(prisma, product.id);
  if (listings.length === 0) return 0;
  const qty = await channelStockQty(prisma as unknown as Tx, product.itemId, product.status === "ACTIVE");
  for (const l of listings) {
    const resolved = await adapterFor(prisma, l.channel);
    if (!resolved) continue;
    const { adapter, ctx } = resolved;
    await adapter.pushStock(ctx, [{ sku: product.sku, qty }]);
    await prisma.channelListing.update({ where: { id: l.id }, data: { stockSynced: true, lastSyncAt: new Date() } });
  }
  return listings.length;
}

export const pushStockOnStockChanged: EventHandler<"stock.changed"> = async (event, { prisma, log, eventId }) => {
  const product = await prisma.product.findUnique({ where: { itemId: event.itemId }, select: { id: true } });
  if (!product) return; // hammadde/ambalaj: pazaryerinde ilanı yok
  const n = await pushStockForProduct(prisma, product.id);
  if (n) log.info({ eventId, productId: product.id, channels: n }, "stock.changed → pazaryeri stoğu itildi");
};

/** Kanalın kendi fiyat listesinde güncel fiyat; yoksa ürünün genel güncel fiyatı (WEB). */
async function priceFor(prisma: Db, productId: string, channelId: string) {
  const now = new Date();
  const own = await prisma.priceListItem.findFirst({
    where: { productId, validFrom: { lte: now }, priceList: { channelId } },
    orderBy: { validFrom: "desc" },
    select: { price: true },
  });
  if (own) return own.price;
  const any = await prisma.priceListItem.findFirst({ where: { productId, validFrom: { lte: now } }, orderBy: { validFrom: "desc" }, select: { price: true } });
  return any?.price ?? null;
}

export const pushPriceOnPriceChanged: EventHandler<"price.changed"> = async (event, { prisma, log, eventId }) => {
  const product = await prisma.product.findUnique({ where: { id: event.productId }, select: { id: true, sku: true } });
  if (!product) return;
  const listings = await activeListings(prisma, product.id);
  let pushed = 0;
  for (const l of listings) {
    const price = await priceFor(prisma, product.id, l.channelId);
    if (!price) continue;
    const resolved = await adapterFor(prisma, l.channel);
    if (!resolved) continue;
    const { adapter, ctx } = resolved;
    await adapter.pushPrice(ctx, [{ sku: product.sku, price: price.toFixed(2) }]);
    await prisma.channelListing.update({ where: { id: l.id }, data: { priceSynced: true, lastSyncAt: new Date() } });
    pushed++;
  }
  if (pushed) log.info({ eventId, productId: product.id, channels: pushed }, "price.changed → pazaryeri fiyatı itildi");
};

/** İlan içeriğini etkileyen ürün alanları. */
const CONTENT_FIELDS = ["name", "sku", "barcode", "concentration", "volumeMl", "scentProfile", "created"];

export const syncListingOnProductUpdated: EventHandler<"product.updated"> = async (event, { prisma, log, eventId }) => {
  const product = await prisma.product.findUnique({
    where: { id: event.productId },
    select: { id: true, sku: true, name: true, barcode: true, concentration: true, volumeMl: true },
  });
  if (!product) return;
  const listings = await activeListings(prisma, product.id);
  if (listings.length === 0) return;
  if (event.fields.some((f) => CONTENT_FIELDS.includes(f))) {
    for (const l of listings) {
      const resolved = await adapterFor(prisma, l.channel);
    if (!resolved) continue;
    const { adapter, ctx } = resolved;
      await adapter.upsertListing(ctx, {
        sku: product.sku,
        title: `${product.name} ${product.concentration} ${product.volumeMl} ml`,
        barcode: product.barcode,
      });
      await prisma.channelListing.update({ where: { id: l.id }, data: { lastSyncAt: new Date() } });
    }
    log.info({ eventId, productId: product.id, channels: listings.length }, "product.updated → pazaryeri ilanı güncellendi");
  }
  // Durum (ACTIVE ↔ satış dışı) değiştiyse satılabilir adet yeniden itilir.
  if (event.fields.includes("status")) await pushStockForProduct(prisma, product.id);
};

export const restockOnComplianceRestored: EventHandler<"compliance.changed"> = async (event, { prisma, log, eventId }) => {
  const product = await prisma.product.findUnique({ where: { id: event.productId }, select: { id: true, status: true } });
  if (!product || product.status !== "ACTIVE") return;
  const n = await pushStockForProduct(prisma, product.id);
  if (n) log.info({ eventId, productId: product.id, channels: n }, "compliance.changed → satışa açıldı; pazaryeri stoğu itildi");
};
