/**
 * Tohum verisi — docs/02-veri-modeli.md §Tohum verisi.
 * Prototipteki örnek verilerle tutarlıdır (docs/06 bağlantısı). Tekrar çalıştırılabilir (idempotent):
 * kayıtlar benzersiz kodlarıyla bulunur, varsa atlanır.
 *
 * DİKKAT
 *  - Stok bakiyesi/lot TOHUMLANMAZ: stok yalnızca StockMovement ile değişir (F1-03 recordMovement).
 *  - TaxRule oranları "teyit bekliyor" notuyla girilir (docs/04-entegrasyonlar.md#dogrulanacaklar).
 *  - Formül yüzdeleri, alerjen oranları, akor skorları ve sadakat/abonelik değerleri ÖRNEKTİR;
 *    gerçek değerler Ar-Ge ve işletme tarafından girilir.
 */
import path from "node:path";
import { hash } from "@node-rs/argon2";
import { defaultRolePermissions, ROLE_CODES, ROLE_NAMES } from "@atelier/shared";
import { config } from "dotenv";
import { createPrismaClient, type Prisma } from "../src/index.js";

config({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });

const prisma = createPrismaClient();
const D = (v: string | number) => v.toString();

async function roles() {
  const matrix = defaultRolePermissions();
  const ids: Record<string, string> = {};
  for (const code of ROLE_CODES) {
    const role = await prisma.role.upsert({
      where: { code },
      update: {},
      create: { code, name: ROLE_NAMES[code] },
    });
    ids[code] = role.id;
    // İzinler yalnızca rol ilk kez oluşturulurken tohumlanır; sonrası yetki ekranından onaylı değişiklikle yönetilir (YTK-02).
    const existing = await prisma.rolePermission.count({ where: { roleId: role.id } });
    if (existing === 0) {
      await prisma.rolePermission.createMany({
        data: matrix[code].map((p) => ({ roleId: role.id, module: p.module, action: p.action })),
      });
    }
  }
  // Satın alma onayı: ₺50.000 üstü yönetici onayı (yetki.md matrisi, "On ≤ ₺50.000").
  const rule = await prisma.approvalRule.findFirst({ where: { module: "purchasing", entity: "PurchaseOrder" } });
  if (!rule) {
    await prisma.approvalRule.create({
      data: { module: "purchasing", entity: "PurchaseOrder", minAmount: D("50000"), approverRoleId: ids.ADMIN! },
    });
  }
  return ids;
}

async function adminUser(adminRoleId: string) {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@atelier.local").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) throw new Error("SEED_ADMIN_PASSWORD tanımlı değil (pnpm setup)");
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return;
  const user = await prisma.user.create({
    data: {
      email,
      fullName: "Sistem Yöneticisi",
      // argon2id, docs/07 §Uygulama güvenliği
      passwordHash: await hash(password, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 }),
      // İki adımlı doğrulama zorunlu; ilk girişte kurulum ekranı açılır.
      twoFactorOn: false,
    },
  });
  await prisma.userRole.create({ data: { userId: user.id, roleId: adminRoleId } });
  console.log(`  yönetici oluşturuldu: ${email} (parola .env → SEED_ADMIN_PASSWORD)`);
}

async function warehouses() {
  const W = [
    { code: "ANA", name: "Ana depo", locs: [["A1-03"], ["B4-02"], ["B6-03"], ["C1-01"], ["D2-01"], ["TANK-01"]] },
    {
      code: "SOGUK",
      name: "Soğuk oda (12–15°C)",
      locs: [
        ["A1-01", 12, 15],
        ["A2-01", 12, 15],
      ],
    },
    { code: "ETICARET", name: "E-ticaret deposu", locs: [["E1-04"], ["E1-05"]] },
  ] as const;
  let seq = 1;
  for (const w of W) {
    const wh = await prisma.warehouse.upsert({ where: { code: w.code }, update: {}, create: { code: w.code, name: w.name } });
    for (const [code, tMin, tMax] of w.locs as readonly (readonly [string, number?, number?])[]) {
      await prisma.location.upsert({
        where: { warehouseId_code: { warehouseId: wh.id, code } },
        update: {},
        create: {
          warehouseId: wh.id,
          code,
          tempMinC: tMin !== undefined ? D(tMin) : null,
          tempMaxC: tMax !== undefined ? D(tMax) : null,
          pickSequence: seq++,
        },
      });
    }
  }
}

type ItemSeed = Omit<Prisma.ItemCreateInput, "minStock"> & { minStock?: number };

const ITEMS: ItemSeed[] = [
  // Hammaddeler
  { code: "HM-0001", name: "Etil alkol 96° denatüre", type: "RAW_MATERIAL", uom: "L", minStock: 600, isHazardous: true, storageNote: "Tank sahası · alev kaynağından uzak (UN1170)" },
  { code: "HM-0005", name: "Distile su", type: "RAW_MATERIAL", uom: "L" },
  { code: "HM-0104", name: "Bergamot esansı (FCF)", type: "RAW_MATERIAL", uom: "KG", minStock: 8, shelfLifeDays: 730, storageNote: "12–15°C, ışıktan uzak" },
  { code: "HM-0112", name: "Noir Ambré konsantre", type: "RAW_MATERIAL", uom: "KG", minStock: 20, shelfLifeDays: 730, storageNote: "12–15°C, ışıktan uzak" },
  { code: "HM-0120", name: "Gül absolü", type: "RAW_MATERIAL", uom: "KG", minStock: 2, shelfLifeDays: 1095, storageNote: "12–15°C, ışıktan uzak" },
  { code: "HM-0125", name: "Vanilya ekstresi", type: "RAW_MATERIAL", uom: "KG", minStock: 3, shelfLifeDays: 730, storageNote: "12–15°C" },
  { code: "HM-0130", name: "Oud aroma baz", type: "RAW_MATERIAL", uom: "KG", minStock: 5, shelfLifeDays: 1095, storageNote: "12–15°C, ışıktan uzak" },
  { code: "HM-0140", name: "UV filtre / stabilizör", type: "RAW_MATERIAL", uom: "KG", minStock: 1 },
  // Ambalajlar
  { code: "AM-0505", name: "Cam şişe 30 ml (flakon)", type: "PACKAGING", uom: "PCS", minStock: 1000 },
  { code: "AM-0510", name: "Cam şişe 50 ml (flakon)", type: "PACKAGING", uom: "PCS", minStock: 2000 },
  { code: "AM-0511", name: "Cam şişe 100 ml (flakon)", type: "PACKAGING", uom: "PCS", minStock: 1500 },
  { code: "AM-0522", name: "Sprey pompa FEA 15", type: "PACKAGING", uom: "PCS", minStock: 1500 },
  { code: "AM-0530", name: "Metal kapak", type: "PACKAGING", uom: "PCS", minStock: 1500 },
  { code: "AM-0540", name: "Kutu Noir Ambré 50 ml", type: "PACKAGING", uom: "PCS", minStock: 1000 },
  { code: "AM-0550", name: "Etiket", type: "PACKAGING", uom: "PCS", minStock: 2000 },
  { code: "AM-0560", name: "Selofan", type: "PACKAGING", uom: "PCS" },
  // Mamuller
  { code: "MM-1003", name: "Noir Ambré EDP 50 ml", type: "FINISHED_GOOD", uom: "PCS", minStock: 300, shelfLifeDays: 1095 },
  { code: "MM-1004", name: "Noir Ambré EDP 100 ml", type: "FINISHED_GOOD", uom: "PCS", minStock: 150, shelfLifeDays: 1095 },
  { code: "MM-1007", name: "Oud Mystique EDP 100 ml", type: "FINISHED_GOOD", uom: "PCS", minStock: 150, shelfLifeDays: 1095 },
  { code: "MM-1011", name: "Velvet Iris EDP 100 ml", type: "FINISHED_GOOD", uom: "PCS", minStock: 150, shelfLifeDays: 1095 },
  { code: "MM-1015", name: "Citrus Néroli EDT 50 ml", type: "FINISHED_GOOD", uom: "PCS", minStock: 200, shelfLifeDays: 730 },
  { code: "MM-1018", name: "Musc Blanc EDP 30 ml", type: "FINISHED_GOOD", uom: "PCS", minStock: 200, shelfLifeDays: 1095 },
  { code: "MM-1020", name: "Keşif seti 5 × 10 ml", type: "FINISHED_GOOD", uom: "PCS", minStock: 400, shelfLifeDays: 730 },
];

async function items() {
  const ids: Record<string, string> = {};
  for (const { minStock, ...it } of ITEMS) {
    const row = await prisma.item.upsert({
      where: { code: it.code },
      update: {},
      create: { ...it, minStock: minStock !== undefined ? D(minStock) : null },
    });
    ids[it.code] = row.id;
  }
  return ids;
}

type Tier = "TOP" | "HEART" | "BASE";
interface ProductSeed {
  item: string;
  sku: string;
  name: string;
  concentration: "EDP" | "EDT";
  volumeMl: number;
  formula?: { code: string; name: string; concentrationPct: number; lines: [string, number][]; allergens?: [string, number][] };
  notes: [Tier, string, string][]; // [kat, nota, aile]
  accords: Record<"amber" | "woody" | "spicy" | "floral" | "fresh" | "sweet", number>;
}

const PRODUCTS: ProductSeed[] = [
  {
    item: "MM-1003",
    sku: "NA-EDP-50",
    name: "Noir Ambré EDP 50 ml",
    concentration: "EDP",
    volumeMl: 50,
    formula: {
      code: "F-NA-03",
      name: "Noir Ambré",
      concentrationPct: 20,
      lines: [
        ["HM-0112", 86.4],
        ["HM-0104", 3.6],
        ["HM-0120", 4],
        ["HM-0125", 6],
      ],
      allergens: [
        ["Linalool", 0.12],
        ["Limonene", 0.09],
        ["Coumarin", 0.05],
        ["Citral", 0.02],
      ],
    },
    notes: [
      ["TOP", "Bergamot", "citrus"],
      ["TOP", "Pembe biber", "spicy"],
      ["TOP", "Kakule", "spicy"],
      ["HEART", "Gül absolü", "floral"],
      ["HEART", "Tütsü", "woody"],
      ["HEART", "İris", "floral"],
      ["BASE", "Amber", "amber"],
      ["BASE", "Vanilya", "gourmand"],
      ["BASE", "Labdanum", "amber"],
      ["BASE", "Misk", "musky"],
    ],
    accords: { amber: 90, woody: 75, spicy: 65, floral: 50, fresh: 25, sweet: 60 },
  },
  {
    item: "MM-1004",
    sku: "NA-EDP-100",
    name: "Noir Ambré EDP 100 ml",
    concentration: "EDP",
    volumeMl: 100,
    formula: undefined, // F-NA-03 ile aynı formül (aşağıda bağlanır)
    notes: [],
    accords: { amber: 90, woody: 75, spicy: 65, floral: 50, fresh: 25, sweet: 60 },
  },
  {
    item: "MM-1007",
    sku: "OM-EDP-100",
    name: "Oud Mystique EDP 100 ml",
    concentration: "EDP",
    volumeMl: 100,
    formula: {
      code: "F-OM-02",
      name: "Oud Mystique",
      concentrationPct: 20,
      lines: [
        ["HM-0130", 70],
        ["HM-0120", 10],
        ["HM-0125", 12],
        ["HM-0104", 8],
      ],
    },
    notes: [
      ["TOP", "Safran", "spicy"],
      ["TOP", "Bergamot", "citrus"],
      ["HEART", "Oud", "woody"],
      ["HEART", "Gül absolü", "floral"],
      ["BASE", "Amber", "amber"],
      ["BASE", "Sandal ağacı", "woody"],
    ],
    accords: { amber: 80, woody: 90, spicy: 70, floral: 40, fresh: 15, sweet: 35 },
  },
  {
    item: "MM-1011",
    sku: "VI-EDP-100",
    name: "Velvet Iris EDP 100 ml",
    concentration: "EDP",
    volumeMl: 100,
    formula: {
      code: "F-VI-01",
      name: "Velvet Iris",
      concentrationPct: 18,
      lines: [
        ["HM-0120", 45],
        ["HM-0125", 25],
        ["HM-0104", 30],
      ],
    },
    notes: [
      ["TOP", "Bergamot", "citrus"],
      ["HEART", "İris", "floral"],
      ["HEART", "Menekşe", "floral"],
      ["BASE", "Misk", "musky"],
      ["BASE", "Sandal ağacı", "woody"],
    ],
    accords: { amber: 30, woody: 45, spicy: 15, floral: 85, fresh: 35, sweet: 40 },
  },
  {
    item: "MM-1015",
    sku: "CN-EDT-50",
    name: "Citrus Néroli EDT 50 ml",
    concentration: "EDT",
    volumeMl: 50,
    formula: {
      code: "F-CN-04",
      name: "Citrus Néroli",
      concentrationPct: 10,
      lines: [
        ["HM-0104", 70],
        ["HM-0120", 20],
        ["HM-0125", 10],
      ],
    },
    notes: [
      ["TOP", "Bergamot", "citrus"],
      ["TOP", "Limon", "citrus"],
      ["HEART", "Neroli", "floral"],
      ["HEART", "Portakal çiçeği", "floral"],
      ["BASE", "Misk", "musky"],
      ["BASE", "Vetiver", "woody"],
    ],
    accords: { amber: 10, woody: 30, spicy: 15, floral: 55, fresh: 90, sweet: 20 },
  },
  {
    item: "MM-1018",
    sku: "MB-EDP-30",
    name: "Musc Blanc EDP 30 ml",
    concentration: "EDP",
    volumeMl: 30,
    formula: {
      code: "F-MB-01",
      name: "Musc Blanc",
      concentrationPct: 16,
      lines: [
        ["HM-0125", 40],
        ["HM-0120", 35],
        ["HM-0104", 25],
      ],
    },
    notes: [
      ["TOP", "Aldehitler", "fresh"],
      ["HEART", "Beyaz çiçekler", "floral"],
      ["BASE", "Beyaz misk", "musky"],
      ["BASE", "Kaşmir ağacı", "woody"],
    ],
    accords: { amber: 20, woody: 30, spicy: 5, floral: 45, fresh: 50, sweet: 35 },
  },
  {
    item: "MM-1020",
    sku: "KS-5X10",
    name: "Keşif seti 5 × 10 ml",
    concentration: "EDP",
    volumeMl: 50,
    notes: [],
    accords: { amber: 55, woody: 55, spicy: 35, floral: 55, fresh: 40, sweet: 40 },
  },
];

/** Noir Ambré 50 ml · 1.000 adet için malzeme listesi (prototip Üretim ekranı). */
const BOM_NA50: [string, number, "KG" | "L" | "PCS"][] = [
  ["HM-0112", 10, "KG"],
  ["HM-0001", 38.5, "L"],
  ["HM-0005", 1.2, "L"],
  ["HM-0140", 0.15, "KG"],
  ["AM-0510", 1000, "PCS"],
  ["AM-0522", 1000, "PCS"],
  ["AM-0530", 1000, "PCS"],
  ["AM-0540", 1000, "PCS"],
  ["AM-0550", 1000, "PCS"],
  ["AM-0560", 1000, "PCS"],
];

async function products(itemIds: Record<string, string>) {
  const formulaIds: Record<string, string> = {};
  const productIds: Record<string, string> = {};
  for (const p of PRODUCTS) {
    let formulaId: string | undefined;
    if (p.formula) {
      const f = p.formula;
      let formula = await prisma.formula.findUnique({ where: { code_version: { code: f.code, version: 1 } } });
      if (!formula) {
        formula = await prisma.formula.create({
          data: {
            code: f.code,
            version: 1,
            name: f.name,
            concentrationPct: D(f.concentrationPct),
            ifraAmendment: 51, // teyit bekliyor (docs/04#dogrulanacaklar)
            ifraCategory: "4",
            status: "APPROVED",
            approvedAt: new Date("2026-09-01T00:00:00Z"),
            lines: { create: f.lines.map(([code, pct]) => ({ itemId: itemIds[code]!, percentage: D(pct) })) },
            allergens: {
              create: (f.allergens ?? []).map(([name, pct]) => ({
                name,
                pctInFinal: D(pct / 100),
                mustLabel: true,
              })),
            },
          },
        });
      }
      formulaId = formula.id;
      formulaIds[f.code] = formula.id;
    }
    if (p.item === "MM-1004") formulaId = formulaIds["F-NA-03"];

    const product = await prisma.product.upsert({
      where: { sku: p.sku },
      update: {},
      create: {
        itemId: itemIds[p.item]!,
        sku: p.sku,
        name: p.name,
        concentration: p.concentration,
        volumeMl: p.volumeMl,
        gtip: "3303.00",
        taxCategory: "PERFUME",
        status: "ACTIVE",
        formulaId,
      },
    });
    productIds[p.item] = product.id;

    const notes = p.item === "MM-1004" ? PRODUCTS[0]!.notes : p.notes;
    for (const [tier, name, family] of notes) {
      const note = await prisma.scentNote.upsert({ where: { name }, update: {}, create: { name, family } });
      await prisma.productNote.upsert({
        where: { productId_noteId: { productId: product.id, noteId: note.id } },
        update: {},
        create: { productId: product.id, noteId: note.id, tier },
      });
    }
    for (const [accord, score] of Object.entries(p.accords)) {
      await prisma.productAccord.upsert({
        where: { productId_accord: { productId: product.id, accord } },
        update: {},
        create: { productId: product.id, accord, score },
      });
    }
  }

  const na50 = productIds["MM-1003"]!;
  const bom = await prisma.billOfMaterials.findFirst({ where: { productId: na50 } });
  if (!bom) {
    await prisma.billOfMaterials.create({
      data: {
        productId: na50,
        formulaId: formulaIds["F-NA-03"]!,
        batchSize: 1000,
        lines: { create: BOM_NA50.map(([code, qty, uom]) => ({ itemId: itemIds[code]!, qty: D(qty), uom })) },
      },
    });
  }
}

/** docs/04-entegrasyonlar.md listesi. Hepsi DISABLED; anahtar girilince etkinleşir. */
const INTEGRATIONS: [string, string][] = [
  ["EINVOICE", "EINVOICE"],
  ["IYZICO", "PAYMENT"],
  ["PAYTR", "PAYMENT"],
  ["STRIPE", "PAYMENT"],
  ["BANK_POS", "PAYMENT"],
  ["TRENDYOL", "MARKETPLACE"],
  ["HEPSIBURADA", "MARKETPLACE"],
  ["AMAZON_TR", "MARKETPLACE"],
  ["N11", "MARKETPLACE"],
  ["CICEKSEPETI", "MARKETPLACE"],
  ["WEBSITE", "ECOMMERCE_SITE"],
  ["CARGO_YURTICI", "CARGO"],
  ["CARGO_ARAS", "CARGO"],
  ["CARGO_MNG", "CARGO"],
  ["CARGO_PTT", "CARGO"],
  ["TRENDYOL_EXPRESS", "CARGO"],
  ["HEPSIJET", "CARGO"],
  ["FX_TCMB", "FX"],
  ["SMS", "MESSAGING"],
  ["WHATSAPP", "MESSAGING"],
  ["IYS", "REGULATORY"],
  ["BANK", "BANK"],
  ["ACCOUNTING", "ACCOUNTING"],
  ["META", "SOCIAL"],
  ["TIKTOK", "SOCIAL"],
  ["YOUTUBE", "SOCIAL"],
  ["PINTEREST", "SOCIAL"],
  ["CLAUDE", "AI"],
  ["IMAGE_GEN", "AI"],
  ["EMBEDDINGS", "AI"],
  ["UTS", "REGULATORY"],
];

async function commerce() {
  const integ: Record<string, string> = {};
  for (const [code, kind] of INTEGRATIONS) {
    const row = await prisma.integration.upsert({ where: { code }, update: {}, create: { code, kind } });
    integ[code] = row.id;
  }

  const channels: [string, string, "WEBSITE" | "MARKETPLACE" | "B2B" | "STORE" | "EXPORT" | "SUBSCRIPTION", string?][] = [
    ["WEB", "Kendi web sitesi", "WEBSITE", "WEBSITE"],
    ["TRENDYOL", "Trendyol", "MARKETPLACE", "TRENDYOL"],
    ["HEPSIBURADA", "Hepsiburada", "MARKETPLACE", "HEPSIBURADA"],
    ["AMAZON_TR", "Amazon TR", "MARKETPLACE", "AMAZON_TR"],
    ["N11", "n11", "MARKETPLACE", "N11"],
    ["CICEKSEPETI", "Çiçeksepeti", "MARKETPLACE", "CICEKSEPETI"],
    ["B2B", "B2B / toptan", "B2B"],
    ["STORE", "Mağaza", "STORE"],
    ["EXPORT", "İhracat", "EXPORT"],
    ["SUBSCRIPTION", "Abonelik", "SUBSCRIPTION"],
  ];
  for (const [code, name, type, integration] of channels) {
    await prisma.salesChannel.upsert({
      where: { code },
      update: {},
      create: { code, name, type, integrationId: integration ? integ[integration] : null },
    });
  }

  const carriers: [string, string, string][] = [
    ["YURTICI", "Yurtiçi Kargo", "CARGO_YURTICI"],
    ["ARAS", "Aras Kargo", "CARGO_ARAS"],
    ["MNG", "MNG Kargo", "CARGO_MNG"],
    ["PTT", "PTT Kargo", "CARGO_PTT"],
    ["TRENDYOL_EXPRESS", "Trendyol Express", "TRENDYOL_EXPRESS"],
    ["HEPSIJET", "HepsiJET", "HEPSIJET"],
  ];
  for (const [code, name, integration] of carriers) {
    await prisma.carrier.upsert({ where: { code }, update: {}, create: { code, name, integrationId: integ[integration] } });
  }

  const providers: [string, string, string?][] = [
    ["IYZICO", "iyzico", "IYZICO"],
    ["PAYTR", "PayTR", "PAYTR"],
    ["STRIPE", "Stripe", "STRIPE"],
    ["BANK_POS", "Banka sanal POS", "BANK_POS"],
    ["TRANSFER", "Havale / EFT"],
    ["COD", "Kapıda ödeme"],
    ["MARKETPLACE", "Pazaryeri tahsilatı"],
  ];
  for (const [code, name, integration] of providers) {
    await prisma.paymentProvider.upsert({
      where: { code },
      update: {},
      create: { code, name, integrationId: integration ? integ[integration] : null },
    });
  }
}

async function taxRules() {
  const validFrom = new Date("2026-01-01T00:00:00Z");
  const note = "teyit bekliyor · docs/04-entegrasyonlar.md#dogrulanacaklar";
  const rules = [
    { category: "PERFUME", gtipPrefix: "3303", kdvRate: "0.20", otvRate: "0.20", otvList: "IV" },
    { category: "COLOGNE", gtipPrefix: "3303", kdvRate: "0.20", otvRate: "0", otvList: null },
    { category: "EXPORT", gtipPrefix: null, kdvRate: "0", otvRate: "0", otvList: null },
  ];
  for (const r of rules) {
    const exists = await prisma.taxRule.findFirst({ where: { category: r.category, validFrom } });
    if (!exists) await prisma.taxRule.create({ data: { ...r, note, validFrom } });
  }
}

async function loyalty() {
  // Prototip "Sadakat & abonelik" ekranındaki seviyeler. Oranlar örnektir, işletme onayıyla kesinleşir.
  const tiers = [
    { code: "DISCOVERY", name: "Keşif", minPoints: 0, earnPct: "0.05", perks: ["Her alışverişte %5 puan", "Doğum gününde numune"] },
    {
      code: "COLLECTOR",
      name: "Koleksiyoner",
      minPoints: 3000,
      earnPct: "0.08",
      perks: ["%8 puan", "Ücretsiz kargo", "Lansmanlara 48 saat erken erişim"],
    },
    {
      code: "ATELIER",
      name: "Atelier",
      minPoints: 10000,
      earnPct: "0.12",
      perks: ["%12 puan", "Kişiye özel etiket", "Yıllık birebir koku danışmanlığı"],
    },
  ];
  for (const t of tiers) await prisma.loyaltyTier.upsert({ where: { code: t.code }, update: {}, create: t });

  await prisma.subscriptionPlan.upsert({
    where: { code: "DISCOVERY_BOX_MONTHLY" },
    update: {},
    // Fiyat işletme tarafından belirlenecek; 0 yer tutucudur, abonelik satışı açılmadan girilmeli.
    create: { code: "DISCOVERY_BOX_MONTHLY", name: "Aylık keşif kutusu", price: "0", intervalMonths: 1, samplesPerBox: 3, sampleMl: "2" },
  });
}

async function main() {
  console.log("Tohum verisi yükleniyor…");
  const roleIds = await roles();
  console.log("  ✓ roller ve yetki matrisi");
  await adminUser(roleIds.ADMIN!);
  await warehouses();
  console.log("  ✓ depolar ve lokasyonlar");
  const itemIds = await items();
  console.log("  ✓ kalemler");
  await products(itemIds);
  console.log("  ✓ ürünler, formüller, notalar, akorlar, reçete");
  await commerce();
  console.log("  ✓ entegrasyonlar, satış kanalları, kargo firmaları, ödeme sağlayıcıları");
  await taxRules();
  console.log("  ✓ vergi kuralları (teyit bekliyor)");
  await loyalty();
  console.log("  ✓ sadakat seviyeleri ve abonelik planı");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
