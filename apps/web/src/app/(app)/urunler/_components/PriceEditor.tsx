"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { inputCls } from "@/components/ui";
import { apiPut, errorText } from "@/lib/api-client";
import { fmtMoney } from "@/lib/format";

/** Satış fiyatı kutusu: yerinde düzenlenir (KDV dahil). Yeni fiyat yeni geçerlilik satırı olarak yazılır. */
export function PriceEditor({
  productId,
  amount,
  includesTax,
  canEdit,
}: {
  productId: string;
  amount: string | null;
  includesTax: boolean;
  canEdit: boolean;
}) {
  const t = useTranslations("catalog.price");
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(amount ? String(Number(amount)) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiPut(`/catalog/products/${productId}/price`, { price: value.trim().replace(/\s/g, "").replace(",", ".") });
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(errorText(err, t("failed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-0.5 rounded-[12px] bg-surface-soft px-3 py-2.5">
      <span className="flex items-center justify-between gap-2 text-[11px] text-muted">
        {t("label")}
        {canEdit && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="font-semibold text-gold-text hover:underline">
            ✎ {amount ? t("edit") : t("set")}
          </button>
        )}
      </span>
      {editing ? (
        <form onSubmit={save} className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              inputMode="decimal"
              placeholder="1250"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className={`${inputCls} num min-h-9 py-1`}
              aria-label={t("label")}
            />
            <span className="text-[13px] font-semibold">₺</span>
          </div>
          <span className="text-[10.5px] text-muted">{t("hint")}</span>
          <div className="flex gap-1.5">
            <button type="submit" disabled={busy || !value.trim()} className="rounded-[8px] bg-ink px-3 py-1 text-[12px] font-semibold text-on-ink disabled:opacity-50">
              {busy ? t("saving") : t("save")}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-[8px] border border-line px-3 py-1 text-[12px] font-semibold">
              {t("cancel")}
            </button>
          </div>
          {error && <span className="text-[11.5px] text-bad">{error}</span>}
        </form>
      ) : (
        <span className={`num font-display text-[19px] font-semibold ${amount ? "text-text" : "text-muted"}`}>
          {amount ? fmtMoney(amount) : t("none")}
          {amount && includesTax && <span className="ml-1.5 align-middle font-body text-[10.5px] font-normal text-muted">{t("inclTax")}</span>}
        </span>
      )}
    </div>
  );
}
