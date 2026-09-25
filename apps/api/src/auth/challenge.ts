import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Parola doğrulandıktan sonra ikinci adıma kadar taşınan kısa ömürlü, imzalı belirteç.
 * Sunucuda durum tutmaz; içeriği: kullanıcı, amaç ve son geçerlilik zamanı.
 */
export interface ChallengePayload {
  uid: string;
  purpose: "mfa" | "enroll";
  exp: number; // epoch ms
}

const sign = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest("base64url");

export function issueChallenge(
  secret: string,
  payload: Omit<ChallengePayload, "exp">,
  ttlMs = 5 * 60_000,
): string {
  const data = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlMs })).toString("base64url");
  return `${data}.${sign(secret, `challenge:${data}`)}`;
}

export function readChallenge(secret: string, token: string, now = Date.now()): ChallengePayload | null {
  const [data, mac] = token.split(".");
  if (!data || !mac) return null;
  const expected = Buffer.from(sign(secret, `challenge:${data}`));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as ChallengePayload;
    if (typeof payload.uid !== "string" || typeof payload.exp !== "number" || payload.exp < now) return null;
    if (payload.purpose !== "mfa" && payload.purpose !== "enroll") return null;
    return payload;
  } catch {
    return null;
  }
}
