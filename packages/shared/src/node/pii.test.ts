import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptField, encryptField, needsReencrypt, parseKeyring, searchHash } from "./pii.js";

const k = () => randomBytes(32).toString("base64");
const k1 = k();
const k2 = k();
const hash = k();

describe("pii", () => {
  const ring = parseKeyring(`k1:${k1}`, "k1", hash);

  it("şifreler ve çözer; her şifreleme farklı çıktı verir", () => {
    const a = encryptField(ring, "12345678901");
    const b = encryptField(ring, "12345678901");
    expect(a).not.toBe(b);
    expect(a).not.toContain("12345678901");
    expect(decryptField(ring, a)).toBe("12345678901");
  });

  it("değiştirilmiş şifreli metni reddeder", () => {
    const token = encryptField(ring, "05321234512");
    const parts = token.split(".");
    const ct = Buffer.from(parts[3]!, "base64url");
    ct[0] = ct[0]! ^ 1;
    parts[3] = ct.toString("base64url");
    expect(() => decryptField(ring, parts.join("."))).toThrow();
  });

  it("anahtar döndürme: eski anahtarla şifrelenen okunur, yeniden şifreleme işaretlenir", () => {
    const old = encryptField(ring, "ayse@example.com");
    const rotated = parseKeyring(`k1:${k1},k2:${k2}`, "k2", hash);
    expect(decryptField(rotated, old)).toBe("ayse@example.com");
    expect(needsReencrypt(rotated, old)).toBe(true);
    expect(needsReencrypt(rotated, encryptField(rotated, "x"))).toBe(false);
  });

  it("arama hash'i normalleştirir", () => {
    expect(searchHash(ring, "phone", "0532 123 45 12")).toBe(searchHash(ring, "phone", "+90 532 123 4512"));
    expect(searchHash(ring, "phone", "5321234512")).toBe(searchHash(ring, "phone", "05321234512"));
    expect(searchHash(ring, "email", " Ayse@Example.com")).toBe(searchHash(ring, "email", "ayse@example.com"));
    expect(searchHash(ring, "email", "x@y.z")).not.toBe(searchHash(ring, "phone", "x@y.z"));
  });

  it("hatalı anahtar yapılandırmasını reddeder", () => {
    expect(() => parseKeyring(`k1:${randomBytes(16).toString("base64")}`, "k1", hash)).toThrow();
    expect(() => parseKeyring(`k1:${k1}`, "k9", hash)).toThrow();
  });
});
