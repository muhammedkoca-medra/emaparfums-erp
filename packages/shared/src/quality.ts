import { z } from "zod";

/** Kalite & mevzuat (F3-04 · docs/03-moduller/kalite.md). */

export const INSPECTION_STATUSES = ["PENDING", "TESTING", "PASSED", "FAILED"] as const;
export type InspectionStatus = (typeof INSPECTION_STATUSES)[number];

/** KAL-02/03: test sonuçlarını kaydet. En az bir sonuç; her biri geçti/kaldı. */
export const inspectionResultsSchema = z.object({
  results: z
    .array(
      z.object({
        testId: z.string().min(1),
        value: z.string().trim().max(120).optional(),
        passed: z.boolean(),
      }),
    )
    .min(1),
});
export type InspectionResultsRequest = z.infer<typeof inspectionResultsSchema>;

/** KAL-02: lot serbest bırakma (tüm zorunlu testler geçmeli). */
export const lotReleaseSchema = z.object({ note: z.string().trim().max(300).optional() });
export type LotReleaseRequest = z.infer<typeof lotReleaseSchema>;

export const COMPLIANCE_DOC_TYPES = ["PIF", "SAFETY_ASSESSMENT", "IFRA_CERTIFICATE", "UTS_NOTIFICATION", "SDS", "STABILITY_REPORT", "LABEL_APPROVAL"] as const;
export type ComplianceDocType = (typeof COMPLIANCE_DOC_TYPES)[number];

export const COMPLIANCE_STATUSES = ["MISSING", "IN_PROGRESS", "VALID", "EXPIRED"] as const;
export type ComplianceStatus = (typeof COMPLIANCE_STATUSES)[number];

/**
 * KAL-04: satışa kapatılmaması için zorunlu belgeler. Parametrik; varsayılan liste.
 * Belge geçerlilik/eşik değerleri mevzuata bağlı → docs/04#dogrulanacaklar.
 */
export const MANDATORY_COMPLIANCE_DOCS: ComplianceDocType[] = ["UTS_NOTIFICATION", "SAFETY_ASSESSMENT", "PIF", "LABEL_APPROVAL"];

/** KAL-04/05: uyum belgesi güncelleme. */
export const complianceUpsertSchema = z.object({
  status: z.enum(COMPLIANCE_STATUSES),
  externalRef: z.string().trim().max(120).nullable().optional(),
  fileUrl: z.string().trim().max(500).nullable().optional(),
  validUntil: z.coerce.date().nullable().optional(),
});
export type ComplianceUpsertRequest = z.infer<typeof complianceUpsertSchema>;

/** KAL-06: geri çağırma (simülasyon yalnızca raporlar; gerçek lotları karantinaya alır). */
export const recallSchema = z.object({
  lotIds: z.array(z.string().min(1)).min(1),
  reason: z.string().trim().min(3).max(500),
  isSimulation: z.boolean().default(true),
});
export type RecallRequest = z.infer<typeof recallSchema>;

/** DÖF (uygunsuzluk) oluşturma. */
export const nonConformanceSchema = z.object({
  lotId: z.string().min(1).nullable().optional(),
  description: z.string().trim().min(3).max(500),
});
export type NonConformanceRequest = z.infer<typeof nonConformanceSchema>;

export const NC_STATUSES = ["OPEN", "INVESTIGATING", "ACTION", "CLOSED"] as const;
export type NcStatus = (typeof NC_STATUSES)[number];

export const nonConformanceUpdateSchema = z.object({
  status: z.enum(NC_STATUSES).optional(),
  rootCause: z.string().trim().max(500).nullable().optional(),
  action: z.string().trim().max(500).nullable().optional(),
});
export type NonConformanceUpdateRequest = z.infer<typeof nonConformanceUpdateSchema>;

/**
 * KAL-04: bir ürünün uyum belgelerine göre satış durumu.
 * Zorunlu belgelerden biri bile VALID değilse SALES_LOCKED; hepsi VALID ise ACTIVE.
 * DRAFT ve DISCONTINUED durumlarına dokunulmaz (yaşam döngüsü ayrı).
 */
export function computeSalesLock(
  current: "DRAFT" | "ACTIVE" | "SALES_LOCKED" | "DISCONTINUED",
  docs: { type: string; status: string }[],
  mandatory: readonly string[] = MANDATORY_COMPLIANCE_DOCS,
): "DRAFT" | "ACTIVE" | "SALES_LOCKED" | "DISCONTINUED" {
  if (current === "DRAFT" || current === "DISCONTINUED") return current;
  const byType = new Map(docs.map((d) => [d.type, d.status]));
  const allValid = mandatory.every((t) => byType.get(t) === "VALID");
  return allValid ? "ACTIVE" : "SALES_LOCKED";
}
