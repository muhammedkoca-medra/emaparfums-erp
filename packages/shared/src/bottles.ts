import { z } from "zod";

/**
 * EMA şişe modelleri (3B seçilebilir). Her model bir ambalaj kalemine (`itemCode`) bağlanır;
 * stok bu kalem üzerinden girilir. Yeni model geldikçe (obj) buraya eklenir.
 *  - objUrl: apps/web/public/ema/ altındaki 3B model.
 *  - glass: gövde camının rengi (hex sayı) — BottleViewer'a geçer.
 */
export interface BottleModel {
  code: string;
  name: string;
  objUrl: string;
  glass: number;
  itemCode: string;
  volumeMl: number;
  /** Yüklenene kadar gösterilecek poster; yoksa boş bırakılır. */
  poster?: string;
}

export const BOTTLE_MODELS: readonly BottleModel[] = [
  { code: "EMA-50-YESIL", name: "50 ml · Zümrüt Yeşili", objUrl: "/ema/ema-parfum-50ml.obj", glass: 0x0c3b2b, itemCode: "AM-SISE-50Y", volumeMl: 50, poster: "/ema/ema-bottle.png" },
  { code: "EMA-50-MAVI", name: "50 ml · Kobalt Mavi", objUrl: "/ema/ema-parfum-50ml-mavi.obj", glass: 0x14306b, itemCode: "AM-SISE-50M", volumeMl: 50 },
  { code: "EMA-KRISTAL", name: "Kristal Sekizgen", objUrl: "/ema/kristal-sekizgen-sise.obj", glass: 0xbcc9cf, itemCode: "AM-SISE-KRISTAL", volumeMl: 50 },
  { code: "EMA-ARAC", name: "Araç Kokusu", objUrl: "/ema/ema-arac-kokusu.obj", glass: 0xcdd6d6, itemCode: "AM-ARAC-KOKU", volumeMl: 8 },
] as const;

export const BOTTLE_MODEL_CODES = BOTTLE_MODELS.map((b) => b.code) as [string, ...string[]];

export const bottleModelByCode = (code: string | null | undefined): BottleModel | null =>
  (code ? BOTTLE_MODELS.find((b) => b.code === code) : null) ?? null;

/** Ürün kartında şişe modeli seçimi. */
export const bottleModelSchema = z.object({
  bottleModel: z.enum(BOTTLE_MODEL_CODES).nullable(),
});
export type BottleModelRequest = z.infer<typeof bottleModelSchema>;
