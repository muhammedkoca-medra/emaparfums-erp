import { type Tx } from "./client.js";

/**
 * Vergi kuralı çözümleme (VRG-02, VRG-04). Oranlar koda yazılmaz; burada TaxRule tablosundan
 * okunur ve çağıran belge satırına KOPYALAR (vergi anlık görüntüsü, docs/02). Hesap
 * packages/shared/src/tax.ts ile yapılır (VRG-01).
 *
 * Geçerli kural: onaylanmış, validFrom ≤ tarih ve (validTo boş ya da > tarih). Birden çok
 * aday varsa en geç başlayan seçilir.
 */
export async function resolveTaxRule(tx: Tx, category: string, at: Date = new Date()) {
  return tx.taxRule.findFirst({
    where: {
      category,
      approvedAt: { not: null },
      validFrom: { lte: at },
      OR: [{ validTo: null }, { validTo: { gt: at } }],
    },
    orderBy: { validFrom: "desc" },
  });
}

export type TaxRuleState = "PENDING" | "ACTIVE" | "SCHEDULED" | "EXPIRED";

export function taxRuleState(
  rule: { approvedAt: Date | null; validFrom: Date; validTo: Date | null },
  at: Date = new Date(),
): TaxRuleState {
  if (!rule.approvedAt) return "PENDING";
  if (rule.validFrom > at) return "SCHEDULED";
  if (rule.validTo && rule.validTo <= at) return "EXPIRED";
  return "ACTIVE";
}
