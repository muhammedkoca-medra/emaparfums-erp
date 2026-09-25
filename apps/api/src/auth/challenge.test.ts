import { describe, expect, it } from "vitest";
import { issueChallenge, readChallenge } from "./challenge.js";

const SECRET = "test-secret-test-secret-test-secret";

describe("challenge", () => {
  it("imzalı belirteci okur", () => {
    const token = issueChallenge(SECRET, { uid: "u1", purpose: "mfa" });
    expect(readChallenge(SECRET, token)).toMatchObject({ uid: "u1", purpose: "mfa" });
  });
  it("farklı anahtarla imzalananı reddeder", () => {
    const token = issueChallenge("baska-bir-anahtar-baska-bir-anahtar", { uid: "u1", purpose: "mfa" });
    expect(readChallenge(SECRET, token)).toBeNull();
  });
  it("içeriği değiştirileni reddeder", () => {
    const token = issueChallenge(SECRET, { uid: "u1", purpose: "mfa" });
    const [, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ uid: "admin", purpose: "mfa", exp: Date.now() + 60_000 })).toString(
      "base64url",
    );
    expect(readChallenge(SECRET, `${forged}.${mac}`)).toBeNull();
  });
  it("süresi dolanı reddeder", () => {
    const token = issueChallenge(SECRET, { uid: "u1", purpose: "enroll" }, 1000);
    expect(readChallenge(SECRET, token, Date.now() + 2000)).toBeNull();
  });
});
