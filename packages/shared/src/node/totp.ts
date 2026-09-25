import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * TOTP (RFC 6238): 30 sn adım, 6 hane, HMAC-SHA1. Google Authenticator, Microsoft Authenticator,
 * 1Password vb. ile uyumlu.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, "").replace(/\s/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error("Geçersiz base32 karakteri");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const generateTotpSecret = () => base32Encode(randomBytes(20));

export function hotp(secret: string, counter: number, digits = 6): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const offset = mac[mac.length - 1]! & 0xf;
  const code =
    ((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  return String(code % 10 ** digits).padStart(digits, "0");
}

export const totpCounter = (atMs: number, stepSec = 30) => Math.floor(atMs / 1000 / stepSec);

export function totp(secret: string, atMs = Date.now()): string {
  return hotp(secret, totpCounter(atMs));
}

/**
 * Kodu ±`window` adım toleransla doğrular. Eşleşen sayaç döner; tekrar kullanımı engellemek için
 * çağıran taraf son kullanılan sayacı saklamalı ve daha küçük/eşit sayacı reddetmelidir.
 */
export function verifyTotp(secret: string, code: string, atMs = Date.now(), window = 1): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const now = totpCounter(atMs);
  for (let i = -window; i <= window; i++) {
    const expected = Buffer.from(hotp(secret, now + i));
    if (timingSafeEqual(expected, Buffer.from(code))) return now + i;
  }
  return null;
}

export function otpauthUrl(opts: { issuer: string; account: string; secret: string }): string {
  const label = encodeURIComponent(`${opts.issuer}:${opts.account}`);
  const params = new URLSearchParams({ secret: opts.secret, issuer: opts.issuer, digits: "6", period: "30" });
  return `otpauth://totp/${label}?${params.toString()}`;
}
