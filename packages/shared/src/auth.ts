import { z } from "zod";

/** Kimlik doğrulama istek şemaları: API doğrulaması ve web formları aynı şemayı kullanır. */

/**
 * `client`/`deviceName` yalnızca iki adımlı doğrulama kapalıyken (yerel geliştirme, MFA_REQUIRED=false)
 * anlam taşır: oturum doğrudan bu adımda açılır. Açıkken istemci türü ikinci adımda verilir.
 */
export const loginRequestSchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(1).max(256),
    client: z.enum(["web", "device"]).default("web"),
    deviceName: z.string().trim().min(1).max(120).optional(),
  })
  .refine((v) => v.client !== "device" || v.deviceName, {
    message: "Cihaz girişinde cihaz adı zorunlu",
    path: ["deviceName"],
  });
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const totpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "6 haneli kod");

/**
 * İkinci adım. `client: "device"` mobil depo cihazı içindir (YTK-07): oturum çerez yerine
 * gövdede token olarak döner ve 12 saat geçerlidir.
 */
export const mfaVerifyRequestSchema = z.discriminatedUnion("client", [
  z.object({ client: z.literal("web"), challenge: z.string().min(1), code: totpCodeSchema }),
  z.object({
    client: z.literal("device"),
    challenge: z.string().min(1),
    code: totpCodeSchema,
    deviceName: z.string().trim().min(1).max(120),
  }),
]);
export type MfaVerifyRequest = z.infer<typeof mfaVerifyRequestSchema>;

export interface DeviceTokenResponse {
  token: string;
  expiresAt: string;
}

/** Parola kuralı: en az 12 karakter. */
export const passwordSchema = z.string().min(12, "Parola en az 12 karakter olmalı").max(256);

export type LoginResponse =
  /** İki adımlı doğrulama kapalı: oturum açıldı (web: çerez; cihaz: token gövdede). */
  | { status: "OK"; token?: string; expiresAt?: string }
  | { status: "MFA_REQUIRED"; challenge: string }
  | { status: "MFA_ENROLL"; challenge: string; otpauthUrl: string; secret: string };

export interface MeResponse {
  id: string;
  email: string;
  fullName: string;
  isExternal: boolean;
  roles: { code: string; name: string }[];
  permissions: string[];
}
