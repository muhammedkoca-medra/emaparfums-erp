import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, hotp, otpauthUrl, totp, verifyTotp } from "./totp.js";

// RFC 6238 Ek B test vektörleri (SHA1, 8 hane → son 6 hane).
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("totp", () => {
  it("base32 gidiş-dönüş", () => {
    const buf = Buffer.from("atelier-parfum");
    expect(base32Decode(base32Encode(buf)).toString()).toBe("atelier-parfum");
  });

  it.each([
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
  ])("RFC 6238 vektörü t=%i", (t, expected) => {
    expect(totp(RFC_SECRET, t * 1000)).toBe(expected);
  });

  it("HOTP RFC 4226 vektörü", () => {
    expect(hotp(RFC_SECRET, 0)).toBe("755224");
    expect(hotp(RFC_SECRET, 9)).toBe("520489");
  });

  it("±1 adım toleransla doğrular, sayacı döner", () => {
    const at = 1_700_000_000_000;
    const prev = totp(RFC_SECRET, at - 30_000);
    expect(verifyTotp(RFC_SECRET, prev, at)).toBe(Math.floor(at / 30000) - 1);
    const old = totp(RFC_SECRET, at - 90_000);
    expect(verifyTotp(RFC_SECRET, old, at)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "12ab56", at)).toBeNull();
  });

  it("otpauth bağlantısı", () => {
    const url = otpauthUrl({ issuer: "Atelier", account: "a@b.c", secret: "ABC" });
    expect(url).toBe("otpauth://totp/Atelier%3Aa%40b.c?secret=ABC&issuer=Atelier&digits=6&period=30");
  });
});
