import { createLot, createPrismaClient, type Db, recordMovement } from "@atelier/db";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pushPriceOnPriceChanged, pushStockOnStockChanged, restockOnComplianceRestored, syncListingOnProductUpdated } from "../src/handlers/marketplace-sync.js";
import { workerTestDbUrl } from "./env.js";

const log = pino({ level: "silent" });
let prisma: Db;
let locId: string;
let marketId: string;
let webId: string;
const tag = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const deps = (id: string) => ({ prisma, log, eventId: id });

async function listedProduct(status: "ACTIVE" | "SALES_LOCKED" = "ACTIVE") {
  const t = tag();
  const item = await prisma.item.create({ data: { code: `MM-${t}`, name: `Mamul ${t}`, type: "FINISHED_GOOD", uom: "PCS" } });
  const p = await prisma.product.create({
    data: { itemId: item.id, sku: `MP-${t}`, name: `Ürün ${t}`, concentration: "EDP", volumeMl: 50, gtip: "3303.00", taxCategory: "PERFUME", status },
  });
  const active = await prisma.channelListing.create({ data: { productId: p.id, channelId: marketId, status: "ACTIVE" } });
  const web = await prisma.channelListing.create({ data: { productId: p.id, channelId: webId, status: "ACTIVE" } });
  return { itemId: item.id, productId: p.id, activeId: active.id, webListingId: web.id };
}

beforeAll(async () => {
  prisma = createPrismaClient(workerTestDbUrl());
  const wh = await prisma.warehouse.create({ data: { code: `W-${tag()}`, name: "Pazaryeri testi" } });
  locId = (await prisma.location.create({ data: { warehouseId: wh.id, code: "M-01", pickSequence: 1 } })).id;
  const ty = await prisma.integration.upsert({ where: { code: "TRENDYOL" }, update: {}, create: { code: "TRENDYOL", kind: "MARKETPLACE" } });
  marketId = (await prisma.salesChannel.create({ data: { code: `TY-${tag()}`, name: "Pazaryeri", type: "MARKETPLACE", integrationId: ty.id } })).id;
  webId = (await prisma.salesChannel.create({ data: { code: `WB-${tag()}`, name: "Web", type: "WEBSITE" } })).id;
});
afterAll(() => prisma.$disconnect());

describe("pazaryeri otomatik senkronu", () => {
  it("stok değişince yalnızca aktif pazaryeri ilanına stok itilir", async () => {
    const p = await listedProduct();
    await prisma.$transaction(async (tx) => {
      const lot = await createLot(tx, { itemId: p.itemId, lotNo: `L-${tag()}`, qcStatus: "RELEASED" });
      await recordMovement(tx, { type: "RECEIPT", itemId: p.itemId, lotId: lot.id, qty: 12, toLocationId: locId, refType: "Test", refId: "mp" });
    });
    await pushStockOnStockChanged({ type: "stock.changed", itemId: p.itemId }, deps("m1"));
    const market = await prisma.channelListing.findUniqueOrThrow({ where: { id: p.activeId } });
    expect(market.stockSynced).toBe(true);
    expect(market.lastSyncAt).not.toBeNull();
    // Web sitesi pazaryeri değil: dokunulmaz
    expect((await prisma.channelListing.findUniqueOrThrow({ where: { id: p.webListingId } })).stockSynced).toBe(false);
  });

  it("entegrasyonu tanımsız pazaryeri kanalı atlanır, işleyici çökmez", async () => {
    const p = await listedProduct();
    const orphan = await prisma.salesChannel.create({ data: { code: `XX-${tag()}`, name: "Bilinmeyen", type: "MARKETPLACE" } });
    const l = await prisma.channelListing.create({ data: { productId: p.productId, channelId: orphan.id, status: "ACTIVE" } });
    await expect(pushStockOnStockChanged({ type: "stock.changed", itemId: p.itemId }, deps("m0"))).resolves.toBeUndefined();
    expect((await prisma.channelListing.findUniqueOrThrow({ where: { id: l.id } })).stockSynced).toBe(false);
    expect((await prisma.channelListing.findUniqueOrThrow({ where: { id: p.activeId } })).stockSynced).toBe(true);
  });

  it("fiyat değişince fiyat itilir; fiyatı olmayan ürün atlanır", async () => {
    const priced = await listedProduct();
    const list = await prisma.priceList.create({ data: { channelId: webId, currency: "TRY" } });
    await prisma.priceListItem.create({ data: { priceListId: list.id, productId: priced.productId, price: "1250" } });
    await pushPriceOnPriceChanged({ type: "price.changed", productId: priced.productId }, deps("m2"));
    expect((await prisma.channelListing.findUniqueOrThrow({ where: { id: priced.activeId } })).priceSynced).toBe(true);

    const unpriced = await listedProduct();
    await pushPriceOnPriceChanged({ type: "price.changed", productId: unpriced.productId }, deps("m3"));
    expect((await prisma.channelListing.findUniqueOrThrow({ where: { id: unpriced.activeId } })).priceSynced).toBe(false);
  });

  it("içerik değişince ilan güncellenir; durum değişince stok yeniden itilir; satışa açılınca stok döner", async () => {
    const p = await listedProduct("SALES_LOCKED");
    await syncListingOnProductUpdated({ type: "product.updated", productId: p.productId, fields: ["name"] }, deps("m4"));
    expect((await prisma.channelListing.findUniqueOrThrow({ where: { id: p.activeId } })).lastSyncAt).not.toBeNull();

    await syncListingOnProductUpdated({ type: "product.updated", productId: p.productId, fields: ["status"] }, deps("m5"));
    expect((await prisma.channelListing.findUniqueOrThrow({ where: { id: p.activeId } })).stockSynced).toBe(true);

    await prisma.channelListing.update({ where: { id: p.activeId }, data: { stockSynced: false } });
    await restockOnComplianceRestored({ type: "compliance.changed", productId: p.productId }, deps("m6"));
    expect((await prisma.channelListing.findUniqueOrThrow({ where: { id: p.activeId } })).stockSynced).toBe(false); // hâlâ kilitli
    await prisma.product.update({ where: { id: p.productId }, data: { status: "ACTIVE" } });
    await restockOnComplianceRestored({ type: "compliance.changed", productId: p.productId }, deps("m7"));
    expect((await prisma.channelListing.findUniqueOrThrow({ where: { id: p.activeId } })).stockSynced).toBe(true);
  });
});
