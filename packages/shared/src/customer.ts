import { z } from "zod";

/** Müşteri ve KVKK rıza şemaları (F2-01 · docs/03-moduller/satis.md, docs/07-guvenlik-kvkk.md). */

export const CUSTOMER_TYPES = ["INDIVIDUAL", "CORPORATE"] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const CONSENT_PURPOSES = ["KVKK", "MARKETING"] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

/** Rıza metni sürümü: kanal + metin sürümü kayıtla birlikte tutulur (docs/07). */
export const CONSENT_TEXT_VERSION = "2026-01";
export const CONSENT_CHANNELS = ["WEB", "STORE", "B2B", "PHONE"] as const;

const email = z.string().trim().toLowerCase().email("Geçerli bir e-posta girin").max(160);
const phone = z
  .string()
  .trim()
  .regex(/^[0-9+()\s-]{7,20}$/, "Geçerli bir telefon girin");
const taxNo = z
  .string()
  .trim()
  .regex(/^\d{10,11}$/, "VKN 10, TCKN 11 hane olmalı");

export const addressSchema = z.object({
  label: z.string().trim().max(40).nullable().optional(),
  line1: z.string().trim().min(3).max(200),
  district: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(80),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, "Posta kodu 5 hane olmalı")
    .nullable()
    .optional(),
  country: z.string().trim().length(2).toUpperCase().default("TR"),
});
export type AddressRequest = z.infer<typeof addressSchema>;

export const customerCreateSchema = z
  .object({
    type: z.enum(CUSTOMER_TYPES),
    fullName: z.string().trim().min(2).max(160),
    email: email.nullable().optional(),
    phone: phone.nullable().optional(),
    taxNo: taxNo.nullable().optional(),
    taxOffice: z.string().trim().max(80).nullable().optional(),
    isEInvoiceUser: z.boolean().default(false),
    kvkkConsent: z.boolean().default(false),
    marketingConsent: z.boolean().default(false),
    consentChannel: z.enum(CONSENT_CHANNELS).default("WEB"),
    address: addressSchema.optional(),
  })
  .refine((v) => v.type !== "CORPORATE" || (v.taxNo && v.taxOffice), {
    message: "Kurumsal müşteride VKN ve vergi dairesi zorunlu",
    path: ["taxNo"],
  });
export type CustomerCreateRequest = z.infer<typeof customerCreateSchema>;

export const customerUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(160).optional(),
  email: email.nullable().optional(),
  phone: phone.nullable().optional(),
  taxNo: taxNo.nullable().optional(),
  taxOffice: z.string().trim().max(80).nullable().optional(),
  isEInvoiceUser: z.boolean().optional(),
});
export type CustomerUpdateRequest = z.infer<typeof customerUpdateSchema>;

export const consentSchema = z.object({
  purpose: z.enum(CONSENT_PURPOSES),
  granted: z.boolean(),
  channel: z.enum(CONSENT_CHANNELS).default("WEB"),
});
export type ConsentRequest = z.infer<typeof consentSchema>;

export const customerQuerySchema = z.object({
  q: z.string().trim().max(160).optional(),
  type: z.enum(CUSTOMER_TYPES).optional(),
});
export type CustomerQuery = z.infer<typeof customerQuerySchema>;
