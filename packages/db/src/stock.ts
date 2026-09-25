/**
 * Stok hareket servisi — StockBalance'ı güncelleyen TEK yer.
 * Faz 1'de uygulanacak (docs/05-yol-haritasi.md, F1-03). İmza sözleşmesi:
 *
 *   recordMovement(tx, {
 *     type, itemId, lotId, qty, fromLocationId?, toLocationId?,
 *     unitCost?, refType?, refId?, userId?, deviceId?
 *   }): Promise<StockMovement>
 *
 * Kurallar (docs/03-moduller/stok.md):
 *  - qty > 0; yön type + from/to ile belirlenir.
 *  - Çıkışta lot.qcStatus RELEASED olmalı (RECEIPT ve QC hareketleri hariç).
 *  - Kullanılabilir miktar (onHand − reserved) negatife düşemez.
 *  - Aynı transaction içinde StockMovement insert + StockBalance upsert
 *    + gerekiyorsa OutboxEvent("stock.below_min").
 */
export {};
