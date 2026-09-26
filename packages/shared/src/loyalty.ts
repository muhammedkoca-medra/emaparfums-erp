import { Decimal } from "decimal.js";
import { z } from "zod";

/** Sadakat (F5-04 · SDK-01…03). Puan kazanımı, seviye ve sona erme. */

/** SDK-01: kazanılan puan = net tutar × seviye earnPct (aşağı yuvarlanır, tam sayı puan). */
export function earnedPoints(net: string | number, earnPct: string | number): number {
  return new Decimal(net).times(earnPct).floor().toNumber();
}

/** SDK-02: puana karşılık gelen en yüksek seviye (minPoints ≤ puan). */
export function selectTier<T extends { minPoints: number }>(points: number, tiers: T[]): T | null {
  const eligible = tiers.filter((t) => t.minPoints <= points).sort((a, b) => b.minPoints - a.minPoints);
  return eligible[0] ?? null;
}

export const redeemSchema = z.object({
  customerId: z.string().min(1),
  points: z.number().int().positive(),
  reason: z.enum(["REDEEM", "REFILL", "BIRTHDAY"]).default("REDEEM"),
  refId: z.string().max(60).nullable().optional(),
});
export type RedeemRequest = z.infer<typeof redeemSchema>;
