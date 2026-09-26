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

/** Esans yüzdesi = esans / (esans + baz). Konsantrasyon göstergesi. */
export function essencePct(essenceGr: number, baseGr: number): number {
  const total = essenceGr + baseGr;
  return total > 0 ? (essenceGr / total) * 100 : 0;
}
