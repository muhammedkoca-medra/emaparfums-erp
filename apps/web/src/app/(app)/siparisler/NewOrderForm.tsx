"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { alertErr, inputCls, labelCls, primaryBtn, secondaryBtn } from "@/components/ui";
import { apiPost, errorText } from "@/lib/api-client";
import { fmtMoney } from "@/lib/format";

interface Ref {
  id: string;
  label: string;
}
interface Line {
  productId: string;
  qty: string;
  unit: string;
  discount: string;
}

/** Yeni sipariş: kanal + müşteri + satırlar. Vergi/toplam sunucuda hesaplanır; burada brüt önizleme. */
export function NewOrderForm({ customers, products, channels }: { customers: Ref[]; products: Ref[]; channels: Ref[] }) {
  const t = useTranslations("orders");
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([{ productId: "", qty: "1", unit: "", discount: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gross = lines.reduce((a, l) => {
    const q = Number(l.qty) || 0;
    const u = Number(l.unit.replace(",", ".")) || 0;
    const d = Number(l.discount.replace(",", ".")) || 0;
    return a + Math.max(0, q * u - d);
  }, 0);

  const setLine = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const clean = lines.filter((l) => l.productId && Number(l.qty) > 0 && l.unit.trim());
    if (clean.length === 0) {
      setError(t("form.noProducts"));
      return;
    }
    const terms = String(d.get("paymentTerms") ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost<{ id: string }>("/sales/orders", {
        channelId: d.get("channelId"),
        customerId: d.get("customerId"),
        ...(terms ? { paymentTermsDays: Number(terms) } : {}),
        lines: clean.map((l) => ({
          productId: l.productId,
          qty: Number(l.qty),
          unitPriceGross: l.unit.replace(",", "."),
          ...(l.discount.trim() ? { discount: l.discount.replace(",", ".") } : {}),
        })),
      });
      router.push(`/siparisler/${res.id}`);
    } catch (err) {
      setError(errorText(err, t("form.saved")));
      setBusy(false);
    }
  }

  if (customers.length === 0 || channels.length === 0) {
    return (
      <section className="self-start rounded-[16px] border border-line bg-surface p-5">
        <h2 className="m-0 mb-2 font-display text-[19px] font-semibold">{t("new")}</h2>
        <p className="m-0 text-[13px] text-muted">{customers.length === 0 ? t("form.noCustomers") : t("form.noProducts")}</p>
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit} aria-label={t("new")} className="flex flex-col gap-3 self-start rounded-[16px] border border-line bg-surface p-5">
      <h2 className="m-0 font-display text-[19px] font-semibold">{t("new")}</h2>
      <label className={labelCls}>
        {t("form.channel")}
        <select name="channelId" required className={inputCls} defaultValue="">
          <option value="" disabled>
            {t("form.choose")}
          </option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className={labelCls}>
        {t("form.customer")}
        <select name="customerId" required className={inputCls} defaultValue="">
          <option value="" disabled>
            {t("form.choose")}
          </option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold">{t("form.lines")}</span>
        {lines.map((l, i) => (
          <div key={i} className="flex flex-col gap-1.5 rounded-[10px] border border-line-soft p-2.5">
            <select aria-label={`${t("form.product")} ${i + 1}`} value={l.productId} onChange={(e) => setLine(i, { productId: e.target.value })} className={inputCls}>
              <option value="">{t("form.choose")}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-3 gap-2">
              <input aria-label={`${t("form.qty")} ${i + 1}`} type="number" min={1} value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} placeholder={t("form.qty")} className={inputCls} />
              <input aria-label={`${t("form.unit")} ${i + 1}`} inputMode="decimal" value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} placeholder={t("form.unit")} className={inputCls} />
              <input aria-label={`${t("form.discount")} ${i + 1}`} inputMode="decimal" value={l.discount} onChange={(e) => setLine(i, { discount: e.target.value })} placeholder={t("form.discount")} className={inputCls} />
            </div>
            {lines.length > 1 && (
              <button type="button" className={`${secondaryBtn} self-end min-h-8 px-3 text-xs`} onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                {t("form.remove")}
              </button>
            )}
          </div>
        ))}
        <button type="button" className={`${secondaryBtn} self-start`} onClick={() => setLines([...lines, { productId: "", qty: "1", unit: "", discount: "" }])}>
          {t("form.addLine")}
        </button>
      </div>

      <div className="flex items-center justify-between rounded-[10px] bg-surface-soft px-3 py-2 text-[13px]">
        <span className="font-semibold">{t("totals.grand")}</span>
        <span className="num font-bold">{fmtMoney(String(gross))}</span>
      </div>

      <label className={labelCls}>
        {t("form.paymentTerms")}
        <input name="paymentTerms" type="number" min={0} max={365} className={inputCls} />
      </label>

      {error && (
        <p role="alert" className={alertErr}>
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className={`${primaryBtn} self-start`}>
        {t("form.create")}
      </button>
    </form>
  );
}
