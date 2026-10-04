import { useTranslations } from "next-intl";

const TONE: Record<string, string> = {
  FULL: "bg-ok-bg text-ok",
  PARTIAL: "bg-warn-bg text-warn",
  WAITING: "bg-bad-bg text-bad",
};

/** Sipariş stok durumu: tümü ayrıldı / kısmi / stok bekliyor (yalnızca onaylanmış, sevk edilmemiş siparişte). */
export function StockStatusBadge({ status }: { status: string | null }) {
  const t = useTranslations("orders.stock");
  if (!status) return null;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${TONE[status] ?? "bg-surface-soft text-muted"}`}>
      {t(status)}
    </span>
  );
}
