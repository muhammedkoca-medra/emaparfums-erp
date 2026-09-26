import { Decimal } from "decimal.js";
import { z } from "zod";

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

export const batchCreateSchema = z.object({
  productId: z.string().min(1),
  plannedQty: z.number().int().min(1).max(1_000_000),
  essenceGr: gr,
  baseGr: gr,
  macerationDays: z.number().int().min(0).max(120),
  macerationPlace: z.string().trim().max(80).nullable().optional(),
  bottleType: z.enum(BOTTLE_TYPES),
});
export type BatchCreateRequest = z.infer<typeof batchCreateSchema>;

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

/** Dolum çıktısı (URT-05): üretilen ve fire adedi. Mamul lotu QUARANTINE açılır. */
export const batchOutputSchema = z.object({
  producedQty: z.number().int().min(1).max(1_000_000),
  scrapQty: z.number().int().min(0).max(1_000_000).default(0),
  note: z.string().trim().max(300).optional(),
});
export type BatchOutputRequest = z.infer<typeof batchOutputSchema>;

/**
 * URT-02: reçete adet başına ölçeklenir (fire payı dahil).
 * ihtiyaç = bomQty × (1 + scrapPct) × plannedQty / batchSize. Satır bazında 4 haneye yuvarlanır.
 * Girdiler Decimal-uyumlu string; para/miktar `number` ile hesaplanmaz (CLAUDE.md kural 5).
 */
export function scaleRequirement(
  bomQty: string | number,
  scrapPct: string | number,
  plannedQty: number,
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
 *  - Alkol/su (HM-0001 alkol, HM-0005 su) → ALCOHOL_WATER; diğer hammadde → ESSENCE.
 *  - Ambalaj: pompa/kapak → PUMP_CAP, kutu/etiket → BOX_LABEL, diğer (şişe) → BOTTLE.
 */
export function costComponentForItem(item: { code: string; type: string; name: string }): CostComponent {
  const c = item.code.toUpperCase();
  const n = item.name.toLowerCase();
  if (item.type === "RAW_MATERIAL") {
    if (c === "HM-0001" || c === "HM-0005") return "ALCOHOL_WATER";
    return "ESSENCE";
  }
  if (item.type === "PACKAGING") {
    if (/pompa|kapak|valf|pump|cap/.test(n)) return "PUMP_CAP";
    if (/kutu|etiket|box|label|karton/.test(n)) return "BOX_LABEL";
    return "BOTTLE";
  }
  return "OVERHEAD";
}
