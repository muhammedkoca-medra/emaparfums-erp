/**
 * Kalite yardımcıları (F3-04 · docs/03-moduller/kalite.md).
 * Lot serbest bırakma ve muayene akışı; stok durumu değişimi stock.ts setLotQcStatus ile yapılır.
 */
import { type Tx } from "./client.js";

/**
 * KAL-01: bir lot için muayene açar. Kalem tipine uygun QcTest yoksa muayene açılmaz.
 * Idempotent: lotun zaten muayenesi varsa yeni açmaz (en az bir kez teslim edilen olay için).
 * Dönüş: açılan muayenenin id'si ya da null (zaten var / uygulanabilir test yok).
 */
export async function openInspectionForLot(tx: Tx, lotId: string): Promise<string | null> {
  const existing = await tx.qcInspection.findFirst({ where: { lotId }, select: { id: true } });
  if (existing) return null;
  const lot = await tx.lot.findUnique({ where: { id: lotId }, select: { item: { select: { type: true } } } });
  if (!lot) return null;
  const tests = await tx.qcTest.findMany({ where: { appliesTo: { has: lot.item.type } }, select: { id: true } });
  if (tests.length === 0) return null;
  const inspection = await tx.qcInspection.create({ data: { lotId, status: "PENDING" } });
  return inspection.id;
}

/** Bir lotun kalem tipine uygulanabilir QcTest'leri (serbest bırakma için hepsi geçmeli). */
export async function applicableTests(tx: Tx, lotId: string) {
  const lot = await tx.lot.findUnique({ where: { id: lotId }, select: { item: { select: { type: true } } } });
  if (!lot) return [];
  return tx.qcTest.findMany({ where: { appliesTo: { has: lot.item.type } }, select: { id: true, code: true, name: true, spec: true } });
}
