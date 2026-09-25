/**
 * Görüntüleme biçimleri (tr-TR). Hesap yapılmaz: API'den gelen Decimal metinleri yalnızca
 * gösterim için sayıya çevrilir (CLAUDE.md kural 5 hesaplar içindir).
 */
const qtyFmt = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 4 });
const moneyFmt = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 2,
});
const moneyCompact = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  notation: "compact",
  maximumFractionDigits: 2,
});

export const fmtQty = (v: string | null | undefined) => (v == null ? "—" : qtyFmt.format(Number(v)));
export const fmtMoney = (v: string | null | undefined) => (v == null ? "—" : moneyFmt.format(Number(v)));
export const fmtMoneyCompact = (v: string | null | undefined) =>
  v == null ? "—" : moneyCompact.format(Number(v));

const dateFmt = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Istanbul",
});
const timeFmt = new Intl.DateTimeFormat("tr-TR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Istanbul",
});
const dateTimeFmt = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Istanbul",
});

export const fmtDate = (iso: string | null | undefined) => (iso ? dateFmt.format(new Date(iso)) : "—");
export const fmtTime = (iso: string) => timeFmt.format(new Date(iso));
export const fmtDateTime = (iso: string) => dateTimeFmt.format(new Date(iso));

/** Bugün içindeyse saat, değilse tarih. */
export function fmtWhen(iso: string, now = new Date()) {
  const d = new Date(iso);
  return d.toDateString() === now.toDateString() ? fmtTime(iso) : fmtDate(iso);
}
