import { z } from "zod";

/**
 * Ayarlanabilir iş kuralı parametreleri (SystemSetting tablosu). Burada yalnızca VARSAYILANLAR
 * ve doğrulama şeması durur; geçerli değer veritabanından okunur ("Otomatik kurallar" ekranı).
 * Yasal değerler (vergi oranı vb.) burada değil, kendi tablolarında tutulur.
 */
export const SETTINGS = {
  /** STK-08: SKT'ye bu kadar gün kalan lotlar uyarı listesine düşer. */
  "stock.expiryWarningDays": { schema: z.number().int().min(1).max(3650), default: 90 },
  /** STK-07: kanallara `kullanılabilir − tampon` gönderilir (adet). */
  "stock.channelBuffer": { schema: z.number().int().min(0).max(10_000), default: 2 },
  /** STK-09: sayım farkının değeri bu tutarı (TRY) aşarsa yönetici onayı gerekir. */
  "stock.countApprovalThreshold": {
    schema: z.string().regex(/^\d+(\.\d{1,2})?$/, "Tutar (ör. 5000.00)"),
    default: "5000.00",
  },
  /** STK-05: aynı kalem için stock.below_min en fazla bu kadar saatte bir yayınlanır. */
  "stock.belowMinRenotifyHours": { schema: z.number().int().min(1).max(720), default: 24 },
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]["schema"]>;

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

export const isSettingKey = (k: string): k is SettingKey => k in SETTINGS;

/** Veritabanındaki değer geçersizse varsayılana düşer (bozuk ayar sistemi durdurmasın). */
export function parseSetting<K extends SettingKey>(key: K, raw: unknown): SettingValue<K> {
  const def = SETTINGS[key];
  const r = def.schema.safeParse(raw);
  return (r.success ? r.data : def.default) as SettingValue<K>;
}
