import { Decimal } from "decimal.js";
import { z } from "zod";
import { itemCodeSchema } from "./catalog.js";

/** Üretim partisi (F3-01 · docs/03-moduller/uretim.md). EMA karışım kartı: esans + parfüm bazı. */

export const BATCH_STAGES = [
  "FORMULA_APPROVAL",
  "WEIGHING_MIXING",
  "MACERATION",
  "CHILL_FILTER",
  "FILLING",
  "LABEL_PACK",
  "QUALITY_CONTROL",
  "RELEASED",
  "CANCELLED",
] as const;
export type BatchStage = (typeof BATCH_STAGES)[number];

/** Normal ileri akış (CANCELLED ve RELEASED dışında). QUALITY_CONTROL → RELEASED kalite modülünde. */
export const STAGE_FLOW: BatchStage[] = [
  "FORMULA_APPROVAL",
  "WEIGHING_MIXING",
  "MACERATION",
  "CHILL_FILTER",
  "FILLING",
  "LABEL_PACK",
  "QUALITY_CONTROL",
  "RELEASED",
];

export const BOTTLE_TYPES = ["METAL", "AMBER"] as const;
export type BottleType = (typeof BOTTLE_TYPES)[number];

const gr = z
  .string()
  .trim()
  .regex(/^\d{1,8}(\.\d{1,2})?$/, "Gramaj sayı olmalı")
  .refine((v) => Number(v) > 0, "Gramaj 0'dan büyük olmalı");

/** Hacim (ml): en çok 2 ondalık, metin olarak taşınır (Decimal). */
const mlAmount = z
  .string()
  .trim()
  .regex(/^\d{1,9}(\.\d{1,2})?$/, "Hacim (ml) sayı olmalı");
const mlPositive = mlAmount.refine((v) => new Decimal(v).greaterThan(0), "Hacim 0'dan büyük olmalı");

/**
 * Yeni parti hacimle açılır (ml). Esans/baz bölünmesi formül konsantrasyonundan sunucuda hesaplanır;
 * beklenen şişe adedi = ⌊ml ÷ ürün hacmi⌋.
 */
/** Geçmiş tarih: gelecek olamaz (saat farkı için 5 dk tolerans). */
const pastDate = z.coerce
  .date()
  .refine((d) => d.getTime() <= Date.now() + 5 * 60_000, "Tarih gelecekte olamaz");

/** Devam eden (mevcut) üretim bu aşamalardan biriyle kaydedilebilir. */
export const START_STAGES = ["FORMULA_APPROVAL", "WEIGHING_MIXING", "MACERATION", "CHILL_FILTER", "FILLING", "LABEL_PACK", "QUALITY_CONTROL"] as const;

export const batchCreateSchema = z.object({
  productId: z.string().min(1),
  plannedMl: mlPositive,
  macerationDays: z.number().int().min(0).max(120),
  macerationPlace: z.string().trim().max(80).nullable().optional(),
  bottleType: z.enum(BOTTLE_TYPES),
  /**
   * Devam eden üretimi kaydetme (URT-14): parti doğrudan bu aşamada açılır. Önceki aşamaların stok
   * rezervasyonu/tüketimi yapılmaz (malzeme geçmişte kullanıldı). Varsayılan: Formül onayı.
   */
  startStage: z.enum(START_STAGES).optional(),
  /** Başlangıç aşamasına giriş tarihi (geçmiş olabilir). */
  startedAt: pastDate.optional(),
  /** Demlenme başlangıcı (demlenme ya da sonrası aşamada kayıtta). */
  macerationStart: pastDate.optional(),
});
export type BatchCreateRequest = z.infer<typeof batchCreateSchema>;

/**
 * Toplam hacmi konsantrasyona göre esans ve baza böler (2 ondalık, yarım yukarı; baz = kalan → toplam korunur).
 * ör. 10.000 ml · %20 → esans 2.000 ml, baz 8.000 ml.
 */
export function splitByConcentration(plannedMl: string | number, concentrationPct: string | number): { essenceMl: string; baseMl: string } {
  const total = new Decimal(plannedMl);
  const essence = total.times(concentrationPct).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return { essenceMl: essence.toFixed(2), baseMl: total.minus(essence).toFixed(2) };
}

/** Beklenen şişe adedi: ⌊toplam ml ÷ şişe hacmi⌋. */
export function expectedUnits(plannedMl: string | number, volumeMl: number): number {
  if (volumeMl <= 0) return 0;
  return new Decimal(plannedMl).dividedBy(volumeMl).floor().toNumber();
}

/** Malzeme ölçeklemesi için etkin adet (kesirli olabilir): toplam ml ÷ şişe hacmi. */
export function effectiveUnits(plannedMl: string | number, volumeMl: number): string {
  if (volumeMl <= 0) return "0";
  return new Decimal(plannedMl).dividedBy(volumeMl).toDecimalPlaces(6).toString();
}

export const batchAdvanceSchema = z.object({
  /** Maserasyon süresi dolmadan geçişte yönetici gerekçesi (URT-04). */
  overrideReason: z.string().trim().max(300).optional(),
});
export type BatchAdvanceRequest = z.infer<typeof batchAdvanceSchema>;

/** Parti değerlerini elle düzenleme (tüm alanlar isteğe bağlı). */
export const batchUpdateSchema = z.object({
  plannedQty: z.number().int().min(1).max(1_000_000).optional(),
  producedQty: z.number().int().min(0).max(1_000_000).optional(),
  essenceGr: gr.optional(),
  baseGr: gr.optional(),
  /** Hacim düzeltmesi (ml). plannedMl değişirse esans/baz konsantrasyondan yeniden bölünür. */
  plannedMl: mlPositive.optional(),
  essenceMl: mlPositive.optional(),
  baseMl: mlPositive.optional(),
  macerationDays: z.number().int().min(0).max(120).optional(),
  macerationPlace: z.string().trim().max(80).nullable().optional(),
  bottleType: z.enum(BOTTLE_TYPES).optional(),
  /** Demlenme başlangıcını elle düzeltme (ISO tarih) ya da null ile sıfırlama. */
  macerationStart: z.coerce.date().nullable().optional(),
});
export type BatchUpdateRequest = z.infer<typeof batchUpdateSchema>;

/** Aşamayı manuel ayarlama (süreç düzeltme). Serbest geçiş; gerekçe denetime yazılır. */
export const batchStageSchema = z.object({
  stage: z.enum(BATCH_STAGES),
  note: z.string().trim().max(300).optional(),
  /** Aşamaya giriş tarihi; geçmiş üretimi işlerken geriye dönük girilir (varsayılan: şimdi). */
  startedAt: pastDate.optional(),
});
export type BatchStageRequest = z.infer<typeof batchStageSchema>;

/** Hat planı slotu (URT-07). Bir parti bir kaynağa (tank/dolum/paket hattı) zaman aralığıyla atanır. */
export const scheduleSlotSchema = z
  .object({
    resourceId: z.string().min(1),
    batchId: z.string().min(1),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    isTentative: z.boolean().default(false),
  })
  .refine((s) => s.endAt.getTime() > s.startAt.getTime(), { message: "Bitiş başlangıçtan sonra olmalı", path: ["endAt"] });
export type ScheduleSlotRequest = z.infer<typeof scheduleSlotSchema>;

export const scheduleUpdateSchema = z
  .object({
    resourceId: z.string().min(1).optional(),
    startAt: z.coerce.date().optional(),
    endAt: z.coerce.date().optional(),
    isTentative: z.boolean().optional(),
  })
  .refine((s) => !(s.startAt && s.endAt) || s.endAt.getTime() > s.startAt.getTime(), { message: "Bitiş başlangıçtan sonra olmalı", path: ["endAt"] });
export type ScheduleUpdateRequest = z.infer<typeof scheduleUpdateSchema>;

/** İki zaman aralığı çakışıyor mu (yarı açık [start,end)). */
export function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/** Esans yüzdesi = esans / (esans + baz). Konsantrasyon göstergesi. */
export function essencePct(essenceGr: number, baseGr: number): number {
  const total = essenceGr + baseGr;
  return total > 0 ? (essenceGr / total) * 100 : 0;
}

/**
 * Dolum çıktısı (URT-05). `producedQty` satılabilir stoğa giden adet; `testerMl` ayrı (satılamaz)
 * tester stoğuna giden hacim; `scrapMl` fire hacmi. Lotlar QUARANTINE açılır.
 * Stoğa giden adet ya da tester hacminden en az biri sıfırdan büyük olmalı.
 */
export const batchOutputSchema = z
  .object({
    producedQty: z.number().int().min(0).max(1_000_000),
    testerMl: mlAmount.default("0"),
    scrapMl: mlAmount.default("0"),
    /** Eski adet bazlı fire alanı (geriye dönük). */
    scrapQty: z.number().int().min(0).max(1_000_000).default(0),
    note: z.string().trim().max(300).optional(),
  })
  .refine((o) => o.producedQty > 0 || new Decimal(o.testerMl).greaterThan(0), {
    message: "Stoğa giden adet ya da tester hacmi girilmeli",
    path: ["producedQty"],
  });
export type BatchOutputRequest = z.infer<typeof batchOutputSchema>;

/**
 * Dolum hacim mutabakatı: dağıtılan hacim (stok adedi × şişe ml + tester + fire) ile partinin hacmi.
 * Fark pozitifse eksik kayıt, negatifse partiden fazla dağıtım vardır. Uyarı amaçlıdır.
 */
export function fillingBalance(input: {
  plannedMl: string | number;
  volumeMl: number;
  producedQty: number;
  testerMl: string | number;
  scrapMl: string | number;
}): { distributedMl: string; differenceMl: string } {
  const distributed = new Decimal(input.producedQty).times(input.volumeMl).plus(input.testerMl).plus(input.scrapMl);
  return {
    distributedMl: distributed.toFixed(2),
    differenceMl: new Decimal(input.plannedMl).minus(distributed).toFixed(2),
  };
}

/**
 * Tester lotunun ml başına maliyeti: partinin sıvı (esans + alkol/su) toplam maliyeti ÷ parti hacmi.
 * Ambalaj, işçilik ve genel gider dahil edilmez (tester ayrı kaba dolar). Hacim yoksa null.
 */
export function liquidCostPerMl(liquidTotal: string | number, plannedMl: string | number | null): string | null {
  if (plannedMl == null || new Decimal(plannedMl).lessThanOrEqualTo(0)) return null;
  return new Decimal(liquidTotal).dividedBy(plannedMl).toDecimalPlaces(6).toString();
}

/**
 * URT-02: reçete adet başına ölçeklenir (fire payı dahil).
 * ihtiyaç = bomQty × (1 + scrapPct) × plannedQty / batchSize. Satır bazında 4 haneye yuvarlanır.
 * Girdiler Decimal-uyumlu string; para/miktar `number` ile hesaplanmaz (CLAUDE.md kural 5).
 */
export function scaleRequirement(
  bomQty: string | number,
  scrapPct: string | number,
  /** Adet; hacimle açılan partide kesirli etkin adet (`effectiveUnits`) gelebilir. */
  plannedQty: number | string,
  batchSize: number,
): string {
  if (batchSize <= 0) throw new Error("batchSize sıfırdan büyük olmalı");
  const need = new Decimal(bomQty)
    .times(new Decimal(1).plus(scrapPct))
    .times(plannedQty)
    .dividedBy(batchSize);
  return need.toDecimalPlaces(4, Decimal.ROUND_UP).toString();
}

/** Maliyet bileşenleri (BatchCost.component ile aynı). */
export const COST_COMPONENTS = [
  "ESSENCE",
  "ALCOHOL_WATER",
  "BOTTLE",
  "PUMP_CAP",
  "BOX_LABEL",
  "DIRECT_LABOR",
  "OVERHEAD",
  "SCRAP",
] as const;
export type CostComponent = (typeof COST_COMPONENTS)[number];

/**
 * Bir kalemi maliyet bileşenine eşler. Tür + kod + ada göre; belirsizde makul varsayılan.
 *  - Alkol/su/parfüm bazı (HM-0001 alkol, HM-0005 su ya da adında alkol/baz/su geçen) → ALCOHOL_WATER;
 *    diğer hammadde → ESSENCE.
 *  - Ambalaj: pompa/kapak → PUMP_CAP, kutu/etiket → BOX_LABEL, diğer (şişe) → BOTTLE.
 */
export function costComponentForItem(item: { code: string; type: string; name: string }): CostComponent {
  const c = item.code.toUpperCase();
  const n = item.name.toLocaleLowerCase("tr-TR");
  if (item.type === "RAW_MATERIAL") {
    if (c === "HM-0001" || c === "HM-0005") return "ALCOHOL_WATER";
    if (/alkol|alcohol|etanol|ethanol|\bbaz\b|bazı|parfüm bazı|\bbase\b|\bsu\b|water/.test(n)) return "ALCOHOL_WATER";
    return "ESSENCE";
  }
  if (item.type === "PACKAGING") {
    if (/pompa|kapak|valf|pump|cap/.test(n)) return "PUMP_CAP";
    if (/kutu|etiket|box|label|karton/.test(n)) return "BOX_LABEL";
    return "BOTTLE";
  }
  return "OVERHEAD";
}

// ---------------------------------------------------------------------------------------------
// Hızlı üretim kurulumu (hazır esans + parfüm bazı)
// ---------------------------------------------------------------------------------------------

/** Kurulum reçetesinin referans parti büyüklüğü (adet). */
export const SETUP_BATCH_SIZE = 1000;

const setupPct = z
  .string()
  .trim()
  .regex(/^\d{1,2}(\.\d{1,2})?$/, "Konsantrasyon en fazla 2 ondalıklı sayı olmalı (ör. 20 ya da 22.5)")
  .refine((v) => new Decimal(v).greaterThan(0) && new Decimal(v).lessThan(100), "Konsantrasyon 0 ile 100 arasında olmalı");

/** Var olan bir kalemi seç ya da yenisini aç (hammadde · hacim birimi L). */
const setupItemChoice = z.union([
  z.object({ itemId: z.string().min(1) }),
  z.object({ newItem: z.object({ code: itemCodeSchema, name: z.string().trim().min(2).max(120) }) }),
]);

export const productionSetupSchema = z.object({
  /** Son üründeki esans oranı (%). */
  concentrationPct: setupPct,
  essence: setupItemChoice,
  base: setupItemChoice,
  /** Her şişe için 1 adet tüketilecek ambalaj kalemleri (şişe, kapak/sprey, etiket, kutu). */
  packagingItemIds: z.array(z.string().min(1)).max(8).default([]),
  ifraCategory: z.string().trim().max(10).nullable().optional(),
});
export type ProductionSetupRequest = z.infer<typeof productionSetupSchema>;

/** Formül kodu ürün SKU'sundan türetilir: EMAK025 → F-EMAK025 (F-[A-Z0-9-]{2,20}). */
export function formulaCodeForSku(sku: string): string {
  const s = sku.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20);
  return `F-${s.length >= 2 ? s : `${s}00`}`;
}

/**
 * Kurulum reçetesinde sıvı satırı miktarı (`batchSize` adet için), kalemin hacim biriminde.
 * esans = şişe ml × adet × konsantrasyon%; baz = kalan. L ise ÷ 1000. 4 ondalık, yarım yukarı.
 * ör. 50 ml · %20 · 1.000 adet → esans 10 L, baz 40 L.
 */
export function setupLiquidQty(
  volumeMl: number,
  concentrationPct: string | number,
  part: "essence" | "base",
  uom: "L" | "ML",
  batchSize: number = SETUP_BATCH_SIZE,
): string {
  const totalMl = new Decimal(volumeMl).times(batchSize);
  const essenceMl = totalMl.times(concentrationPct).dividedBy(100);
  const ml = part === "essence" ? essenceMl : totalMl.minus(essenceMl);
  const qty = uom === "L" ? ml.dividedBy(1000) : ml;
  return qty.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4);
}

/**
 * Parti kalite onayı (tek adım): kullanıcı partinin lotlarına uygulanan testleri "geçti" olarak işaretler.
 * KAL-02 korunur: her lotun uygulanabilir tüm testleri bu listede olmalı; aksi halde serbest bırakılmaz.
 */
export const batchQualityReleaseSchema = z.object({
  passedTestIds: z.array(z.string().min(1)).max(50),
  note: z.string().trim().max(300).optional(),
});
export type BatchQualityReleaseRequest = z.infer<typeof batchQualityReleaseSchema>;
