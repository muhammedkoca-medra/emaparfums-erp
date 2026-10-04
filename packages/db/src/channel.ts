import { type Tx } from "./client.js";
import { getSetting } from "./settings.js";
import { reservableForItem } from "./stock.js";

/**
 * Pazaryerine bildirilecek satılabilir adet (STK-07): yalnızca serbest ve süresi geçmemiş lotların boştaki
 * miktarı (kural 3) − kanal stok tamponu (`stock.channelBuffer`, ayarlanabilir). Tam sayıya aşağı yuvarlanır,
 * 0'ın altına inmez. Ürün satışta değilse (`active=false`) 0 bildirilir.
 */
export async function channelStockQty(tx: Tx, itemId: string, active = true): Promise<number> {
  if (!active) return 0;
  const [{ reservable }, buffer] = await Promise.all([reservableForItem(tx, itemId), getSetting(tx, "stock.channelBuffer")]);
  return Math.max(0, reservable.floor().toNumber() - buffer);
}
