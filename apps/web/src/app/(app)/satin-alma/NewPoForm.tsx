"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { alertErr, inputCls, labelCls, primaryBtn, secondaryBtn } from "@/components/ui";
import { apiPost, errorText } from "@/lib/api-client";

interface Ref {
  id: string;
  label: string;
}
interface Line {
  itemId: string;
  qty: string;
  unit: string;
}

export function NewPoForm({ suppliers, items }: { suppliers: Ref[]; items: Ref[] }) {
  const t = useTranslations("purchasing");
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([{ itemId: "", qty: "1", unit: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const clean = lines.filter((l) => l.itemId && Number(l.qty) > 0 && l.unit.trim());
    if (clean.length === 0) {
      setError(t("form.noItems"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost<{ id: string }>("/purchasing/orders", {
        supplierId: d.get("supplierId"),
        lines: clean.map((l) => ({ itemId: l.itemId, qty: l.qty.replace(",", "."), unitPrice: l.unit.replace(",", "."), kdvRate: "0.20" })),
      });
      router.push(`/satin-alma/${res.id}`);
    } catch (err) {
      setError(errorText(err, t("form.saved")));
      setBusy(false);
    }
  }

  if (suppliers.length === 0 || items.length === 0) {
    return (
      <section className="self-start rounded-[16px] border border-line bg-surface p-5">
        <h2 className="m-0 mb-2 font-display text-[19px] font-semibold">{t("newOrder")}</h2>
        <p className="m-0 text-[13px] text-muted">{suppliers.length === 0 ? t("newSupplier") : t("form.noItems")}</p>
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit} aria-label={t("newOrder")} className="flex flex-col gap-3 self-start rounded-[16px] border border-line bg-surface p-5">
      <h2 className="m-0 font-display text-[19px] font-semibold">{t("newOrder")}</h2>
      <label className={labelCls}>
        {t("form.supplier")}
        <select name="supplierId" required className={inputCls} defaultValue="">
          <option value="" disabled>
            {t("form.choose")}
          </option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      {lines.map((l, i) => (
        <div key={i} className="flex flex-col gap-1.5 rounded-[10px] border border-line-soft p-2.5">
          <select aria-label={`${t("form.item")} ${i + 1}`} value={l.itemId} onChange={(e) => set(i, { itemId: e.target.value })} className={inputCls}>
            <option value="">{t("form.choose")}</option>
            {items.map((it) => (
              <option key={it.id} value={it.id}>
                {it.label}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input aria-label={`${t("form.qty")} ${i + 1}`} inputMode="decimal" value={l.qty} onChange={(e) => set(i, { qty: e.target.value })} placeholder={t("form.qty")} className={inputCls} />
            <input aria-label={`${t("form.unit")} ${i + 1}`} inputMode="decimal" value={l.unit} onChange={(e) => set(i, { unit: e.target.value })} placeholder={t("form.unit")} className={inputCls} />
          </div>
          {lines.length > 1 && (
            <button type="button" className={`${secondaryBtn} self-end min-h-8 px-3 text-xs`} onClick={() => setLines(lines.filter((_, j) => j !== i))}>
              {t("form.remove")}
            </button>
          )}
        </div>
      ))}
      <button type="button" className={`${secondaryBtn} self-start`} onClick={() => setLines([...lines, { itemId: "", qty: "1", unit: "" }])}>
        {t("form.addLine")}
      </button>
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
