/** API yanıt tipleri (apps/api/src/stock). */
export interface BalanceRow {
  itemId: string;
  code: string;
  name: string;
  type: string;
  uom: string;
  minStock: string | null;
  itemAvailable: string;
  lotId: string | null;
  lotNo: string | null;
  expiryDate: string | null;
  qcStatus: string | null;
  locationId: string | null;
  locationCode: string | null;
  warehouseName: string | null;
  qtyOnHand: string;
  qtyReserved: string;
  status: string;
}

export interface StockSummary {
  stockValue: string | null;
  itemsWithoutCost: number;
  criticalItems: number;
  expiringLots: number;
  expiryWarningDays: number;
  turnoverDays: number | null;
}

export interface MovementRow {
  id: string;
  type: string;
  qty: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  uom: string;
  lotNo: string;
  from: string | null;
  to: string | null;
  refType: string | null;
  refId: string | null;
  note: string | null;
  user: string | null;
  createdAt: string;
}

export interface WarehouseRow {
  id: string;
  code: string;
  name: string;
  locations: { id: string; code: string; used: boolean }[];
  locationCount: number;
  usedLocations: number;
  tempMinC: string | null;
  tempMaxC: string | null;
}

export type StockRules = Record<string, { value: number | string; default: number | string }>;

/** Giriş hareketleri: artış (+); çıkışlar (−); transfer (↔). */
export const movementSign = (m: Pick<MovementRow, "type" | "from" | "to">) =>
  m.type === "TRANSFER" ? "↔" : m.to && !m.from ? "+" : "−";
