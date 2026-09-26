/**
 * EMA Parfums katalog kartlarını ürün olarak içe aktarır (vitrin verisi).
 * Kaynak: prisma/data/ema-showcase.json (kartlardan çıkarılan yapısal veri).
 *
 * Her kart için: bir mamul Item + satılabilir Product + ham koku profili (Product.scentProfile).
 * - Ürün adı = referans adı; baştaki referans marka ayıklanır (vitrinde marka gizli, docs/07).
 * - referenceBrand yalnızca scentProfile içinde, iç kayıtta saklanır.
 * - Hacim/konsantrasyon kartta yok: 50 ml · EDP varsayılan (sonradan düzenlenebilir).
 * - Idempotent: SKU'ya göre upsert; tekrar çalıştırınca çoğaltmaz.
 *
 * Çalıştırma: pnpm db:import:showcase
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { type ScentProfile, scentProfileSchema } from "@atelier/shared";
import { config } from "dotenv";
import { createPrismaClient } from "../src/index.js";

config({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });
const prisma = createPrismaClient();

interface Card {
  orderCode: string;
  refName: string;
  refBrand: string;
  gender: "women" | "men" | "unisex";
  accords: { label: string; strength: number }[];
  dayPct: number;
  seasons: { winter: number; spring: number; summer: number; autumn: number };
  file: string;
}

/** Kart görseli apps/web/public/urun-gorsel/<SKU>.jpeg olarak servis edilir. */
const mediaUrl = (sku: string) => `/urun-gorsel/${sku}.jpeg`;

/** Ürün adı: referans adından baştaki marka adı ayıklanır ("Acqua di Parma Magnolia Nobile" → "Magnolia Nobile"). */
function displayName(refName: string, refBrand: string): string {
  const name = refName.trim();
  const brand = refBrand.trim();
  if (brand && name.toLocaleLowerCase("tr-TR").startsWith(brand.toLocaleLowerCase("tr-TR"))) {
    const rest = name.slice(brand.length).trim();
    if (rest.length >= 2) return rest;
  }
  return name;
}

/** EMAK025 → EM-K025, EMAE001 → EM-E001 (Item kod biçimi: ^[A-Z]{2}-[A-Z0-9]{2,10}$). */
function itemCode(orderCode: string): string {
  const rest = orderCode.replace(/^EMA/, "").toUpperCase();
  return `EM-${rest}`;
}

async function main() {
  const file = path.resolve(import.meta.dirname, "data/ema-showcase.json");
  const cards = JSON.parse(readFileSync(file, "utf8")) as Card[];
  let created = 0;
  let updated = 0;

  for (const card of cards) {
    const sku = card.orderCode.toUpperCase();
    const name = displayName(card.refName, card.refBrand);
    const profile: ScentProfile = scentProfileSchema.parse({
      referenceName: card.refName,
      referenceBrand: card.refBrand,
      gender: card.gender,
      accords: card.accords,
      dayPct: card.dayPct,
      seasons: card.seasons,
      source: "ema-card",
    });

    // Item (mamul) upsert
    const item = await prisma.item.upsert({
      where: { code: itemCode(card.orderCode) },
      update: { name },
      create: { code: itemCode(card.orderCode), name, type: "FINISHED_GOOD", uom: "PCS" },
    });

    const existing = await prisma.product.findUnique({ where: { sku } });
    let productId: string;
    if (existing) {
      await prisma.product.update({
        where: { sku },
        data: { name, status: "ACTIVE", scentProfile: profile as object },
      });
      productId = existing.id;
      updated++;
    } else {
      const p = await prisma.product.create({
        data: {
          itemId: item.id,
          sku,
          name,
          concentration: "EDP",
          volumeMl: 50,
          gtip: "3303.00",
          taxCategory: "PERFUME",
          status: "ACTIVE",
          scentProfile: profile as object,
        },
      });
      productId = p.id;
      created++;
    }

    // Kart görseli (NOTES_CARD). Idempotent: aynı rolü yeniden yaz.
    await prisma.productMedia.deleteMany({ where: { productId, role: "NOTES_CARD" } });
    await prisma.productMedia.create({
      data: { productId, role: "NOTES_CARD", url: mediaUrl(sku), sortOrder: 0 },
    });
  }

  console.log(`Vitrin içe aktarımı bitti: ${created} yeni, ${updated} güncellendi (toplam ${cards.length}).`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
