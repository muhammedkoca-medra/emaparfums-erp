import { describe, expect, it } from "vitest";
import { supplierScore } from "./purchasing.js";

const d = (s: string) => new Date(s);

describe("supplierScore (SAT-07)", () => {
  it("veri yoksa uydurma puan vermez", () => {
    expect(supplierScore([])).toEqual({ receipts: 0, onTimePct: null, qualityRejectPct: null, avgLeadDays: null, score: null });
  });

  it("zamanında teslim, kalite reddi, teslim süresi ve puanı gerçek kabulden hesaplar", () => {
    const r = supplierScore([
      // PO-1: 10 günde, zamanında; 100 kabul, 5 ret
      { poId: "1", poCreatedAt: d("2026-09-01"), expectedAt: d("2026-09-12"), receivedAt: d("2026-09-11"), qty: "100", rejectedQty: "5" },
      // PO-2: 20 günde, gecikmeli; 100 kabul, ret yok
      { poId: "2", poCreatedAt: d("2026-09-01"), expectedAt: d("2026-09-15"), receivedAt: d("2026-09-21"), qty: "100", rejectedQty: "0" },
    ]);
    expect(r.receipts).toBe(2);
    expect(r.onTimePct).toBe(50);
    expect(r.qualityRejectPct).toBe(2.5);
    expect(r.avgLeadDays).toBe(15);
    expect(r.score).toBe(74); // (50 + 97.5) / 2 = 73.75 → 74
  });

  it("aynı siparişin ikinci kabulü teslim süresine bir kez sayılır; beklenen tarih yoksa zamanında", () => {
    const r = supplierScore([
      { poId: "1", poCreatedAt: d("2026-09-01"), expectedAt: null, receivedAt: d("2026-09-05"), qty: "10", rejectedQty: "0" },
      { poId: "1", poCreatedAt: d("2026-09-01"), expectedAt: null, receivedAt: d("2026-09-20"), qty: "10", rejectedQty: "0" },
    ]);
    expect(r.onTimePct).toBe(100);
    expect(r.avgLeadDays).toBe(4);
  });
});
