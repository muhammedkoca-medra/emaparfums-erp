/**
 * Kişisel veri ve gizli değer maskeleme (docs/07-guvenlik-kvkk.md).
 * Loglara, IntegrationLog'a ve hata mesajlarına yazılan her yapı buradan geçer.
 * Tarayıcıda da çalışır (Node API'si kullanmaz).
 */

const digits = (v: string) => v.replace(/\D/g, "");

/** 05321234512 → "05** *** **12" */
export function maskPhone(value: string | null | undefined): string {
  if (!value) return "";
  const d = digits(value);
  if (d.length < 4) return "*".repeat(d.length);
  return `${d.slice(0, 2)}** *** **${d.slice(-2)}`;
}

/** TCKN (11) / VKN (10): ilk 2 ve son 2 hane görünür. */
export function maskTaxNo(value: string | null | undefined): string {
  if (!value) return "";
  const d = digits(value);
  if (d.length < 5) return "*".repeat(d.length);
  return `${d.slice(0, 2)}${"*".repeat(d.length - 4)}${d.slice(-2)}`;
}

/** ayse.yilmaz@example.com → "a***@e***.com" */
export function maskEmail(value: string | null | undefined): string {
  if (!value) return "";
  const at = value.indexOf("@");
  if (at < 1) return "***";
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : "";
  return `${local[0]}***@${host[0] ?? ""}***${tld}`;
}

/** Tamamen gizlenen anahtarlar (değer hiç yazılmaz). */
const SECRET_KEYS =
  /pass(word)?|secret|token|api[-_]?key|authorization|cookie|credential|private[-_]?key|^(cvv|cvc|pan|otp)$|card[-_]?(no|number)|totp|otp[-_]?code/i;
const PHONE_KEYS = /phone|gsm|mobile|telefon/i;
const TAXNO_KEYS = /tckn|vkn|tax[-_]?no|identity[-_]?no|national[-_]?id/i;
const EMAIL_KEYS = /e-?mail/i;

/** 15–19 haneli, Luhn kontrolünden geçen diziler kart numarası sayılır (EAN-13 barkodlar etkilenmez). */
const CARD_LIKE = /\b\d(?:[ -]?\d){14,18}\b/g;

function luhn(num: string): boolean {
  let sum = 0;
  for (let i = 0; i < num.length; i++) {
    let d = Number(num[num.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function maskCardNumbers(text: string): string {
  return text.replace(CARD_LIKE, (m) => (luhn(digits(m)) ? "[kart-gizli]" : m));
}

/**
 * Bir nesneyi derinlemesine kopyalar, anahtar adına göre maskeler.
 * Serbest metinlerdeki kart numarası benzeri diziler de gizlenir.
 */
export function maskDeep<T>(input: T, depth = 0): T {
  if (depth > 12) return "[derin]" as T;
  if (input === null || input === undefined) return input;
  if (typeof input === "string") return maskCardNumbers(input) as T;
  if (Array.isArray(input)) return input.map((v) => maskDeep(v, depth + 1)) as T;
  if (input instanceof Date) return input;
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (SECRET_KEYS.test(key)) out[key] = value == null ? value : "[gizli]";
      else if (typeof value === "string" && PHONE_KEYS.test(key)) out[key] = maskPhone(value);
      else if (typeof value === "string" && TAXNO_KEYS.test(key)) out[key] = maskTaxNo(value);
      else if (typeof value === "string" && EMAIL_KEYS.test(key)) out[key] = maskEmail(value);
      else out[key] = maskDeep(value, depth + 1);
    }
    return out as T;
  }
  return input;
}
