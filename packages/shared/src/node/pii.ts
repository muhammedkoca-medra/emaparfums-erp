import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

/**
 * Alan şifreleme (docs/07-guvenlik-kvkk.md §Gizli kişisel).
 *  - AES-256-GCM, her değer için rastgele 12 bayt IV.
 *  - Biçim: "<anahtarKimliği>.<iv>.<etiket>.<şifreli>" (base64url). Anahtar kimliği sayesinde
 *    anahtar döndürülünce eski kayıtlar okunmaya devam eder.
 *  - Arama için HMAC-SHA256 hash (şifreli alanda eşitlik araması yapılamaz).
 * Anahtarlar ortam değişkeninden gelir: PII_ENC_KEYS="k1:<base64 32 bayt>,k2:…", PII_ENC_ACTIVE_KEY, PII_HASH_KEY.
 */

export interface PiiKeyring {
  activeKeyId: string;
  keys: Map<string, Buffer>;
  hashKey: Buffer;
}

export function parseKeyring(encKeys: string, activeKeyId: string, hashKey: string): PiiKeyring {
  const keys = new Map<string, Buffer>();
  for (const part of encKeys
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    const sep = part.indexOf(":");
    if (sep < 1) throw new Error("PII_ENC_KEYS biçimi: <kimlik>:<base64 anahtar>");
    const id = part.slice(0, sep);
    const key = Buffer.from(part.slice(sep + 1), "base64");
    if (key.length !== 32) throw new Error(`PII anahtarı ${id} 32 bayt olmalı`);
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`Geçersiz anahtar kimliği: ${id}`);
    keys.set(id, key);
  }
  if (!keys.has(activeKeyId)) throw new Error(`Etkin PII anahtarı bulunamadı: ${activeKeyId}`);
  const hk = Buffer.from(hashKey, "base64");
  if (hk.length < 32) throw new Error("PII_HASH_KEY en az 32 bayt olmalı");
  return { activeKeyId, keys, hashKey: hk };
}

export function keyringFromEnv(env: NodeJS.ProcessEnv = process.env): PiiKeyring {
  const { PII_ENC_KEYS, PII_ENC_ACTIVE_KEY, PII_HASH_KEY } = env;
  if (!PII_ENC_KEYS || !PII_ENC_ACTIVE_KEY || !PII_HASH_KEY) {
    throw new Error("PII_ENC_KEYS, PII_ENC_ACTIVE_KEY ve PII_HASH_KEY tanımlı olmalı (pnpm bootstrap)");
  }
  return parseKeyring(PII_ENC_KEYS, PII_ENC_ACTIVE_KEY, PII_HASH_KEY);
}

const b64 = (b: Buffer) => b.toString("base64url");

export function encryptField(ring: PiiKeyring, plaintext: string): string {
  const key = ring.keys.get(ring.activeKeyId)!;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [ring.activeKeyId, b64(iv), b64(cipher.getAuthTag()), b64(ct)].join(".");
}

export function decryptField(ring: PiiKeyring, token: string): string {
  const [keyId, iv, tag, ct] = token.split(".");
  if (!keyId || !iv || !tag || ct === undefined) throw new Error("Şifreli alan biçimi geçersiz");
  const key = ring.keys.get(keyId);
  if (!key) throw new Error(`PII anahtarı bulunamadı: ${keyId}`);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

/** Değer etkin anahtardan farklı bir anahtarla şifrelenmişse yeniden şifrelenmeli. */
export const needsReencrypt = (ring: PiiKeyring, token: string) => !token.startsWith(`${ring.activeKeyId}.`);

export type PiiKind = "phone" | "email" | "taxNo";

/** Arama öncesi normalleştirme: aynı değerin farklı yazımları aynı hash'i üretir. */
export function normalizePii(kind: PiiKind, value: string): string {
  const v = value.trim();
  switch (kind) {
    case "email":
      return v.toLowerCase();
    case "taxNo":
      return v.replace(/\D/g, "");
    case "phone": {
      let d = v.replace(/\D/g, "");
      // Türkiye: 0532…, 532…, 90532… → 90532…
      if (d.length === 10 && d.startsWith("5")) d = `90${d}`;
      else if (d.length === 11 && d.startsWith("0")) d = `90${d.slice(1)}`;
      return d;
    }
  }
}

export function searchHash(ring: PiiKeyring, kind: PiiKind, value: string): string {
  return createHmac("sha256", ring.hashKey)
    .update(`${kind}:${normalizePii(kind, value)}`)
    .digest("hex");
}
