import { z } from "zod";

/** İçerik stüdyosu + sosyal medya (F4-09/10 · docs/03-moduller içerik/sosyal). Yerelde metin üretimi mock. */

export const CONTENT_KINDS = ["SOCIAL_POST", "PRODUCT_DESCRIPTION", "REELS_SCRIPT", "PRODUCT_IMAGE"] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

export const contentBriefSchema = z.object({
  productId: z.string().min(1).nullable().optional(),
  kind: z.enum(CONTENT_KINDS),
  channels: z.array(z.string().trim().min(1)).default([]),
  tone: z.string().trim().min(2).max(40),
  audience: z.string().trim().max(80).nullable().optional(),
  keywords: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});
export type ContentBriefRequest = z.infer<typeof contentBriefSchema>;

export const POST_STATUSES = ["DRAFT", "PENDING_APPROVAL", "SCHEDULED", "PUBLISHED", "FAILED"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const socialPostSchema = z.object({
  accountId: z.string().min(1),
  caption: z.string().trim().min(1).max(2200),
  scheduledAt: z.coerce.date().nullable().optional(),
  productIds: z.array(z.string().min(1)).max(20).default([]),
  utmCampaign: z.string().trim().max(60).nullable().optional(),
  briefId: z.string().min(1).nullable().optional(),
});
export type SocialPostRequest = z.infer<typeof socialPostSchema>;

/**
 * ICR-05: uyum kuralları. Kozmetikte tıbbi/mutlak iddialar yasak. Metinde geçen yasak ifadeler döner.
 * Liste parametriktir (mevzuat teyidi; docs/04#dogrulanacaklar). Varsayılan örnek liste.
 */
export const DEFAULT_BANNED_CLAIMS = ["tedavi", "iyileştirir", "kanser", "şifa", "hastalık", "%100 kalıcı", "garanti eder", "yan etkisiz", "mucize"];

export function checkContentCompliance(text: string, banned: string[] = DEFAULT_BANNED_CLAIMS): string[] {
  const lower = text.toLocaleLowerCase("tr");
  return banned.filter((b) => lower.includes(b.toLocaleLowerCase("tr")));
}

/**
 * ICR-02: brif → metin (mock, yerel; gerçek CLAUDE üretimi ağa çıkışta). Deterministik şablon:
 * ton + anahtar kelimeler + ürün adı ile kısa bir sosyal metin üretir. Uyum kuralı sonradan kontrol edilir.
 */
export function generateCaption(input: { productName?: string | null; tone: string; keywords: string[]; kind: string }): string {
  const name = input.productName ?? "EMA Parfums";
  const kw = input.keywords.slice(0, 5);
  const hashtags = kw.map((k) => `#${k.replace(/\s+/g, "")}`).join(" ");
  if (input.kind === "PRODUCT_DESCRIPTION") {
    return `${name} — ${input.tone} bir imza. ${kw.length ? kw.join(", ") + " notalarıyla" : "özenle seçilmiş notalarıyla"} günün her anına eşlik eder.`;
  }
  if (input.kind === "REELS_SCRIPT") {
    return `Sahne 1: ${name} şişesi ışıkta. Sahne 2: ${kw[0] ?? "koku"} bulutu. Kapanış: "${name} — ${input.tone}." ${hashtags}`.trim();
  }
  return `${name} ile ${input.tone} bir gün. ${kw.length ? kw.join(" · ") : "Zarafet"} ${hashtags}`.trim();
}
