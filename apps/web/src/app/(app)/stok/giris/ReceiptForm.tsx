"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { alertErr, inputCls, labelCls, primaryBtn } from "@/components/ui";
import { apiPost, ClientApiError } from "@/lib/api-client";

/** Elle stok girişi: açılış stoğu veya elle mal kabul. Yeni lot karantinada açılır. */
export function ReceiptForm({
  items,
  lots,
  locations,
}: {
  items: { id: string; code: string; name: string; uom: string }[];
  lots: { itemId: string; id: string; lotNo: string }[];
  locations: { id: string; label: string }[];
}) {
  const t = useTranslations("stock");
  const router = useRouter();
  const [itemId, setItemId] = useState("");
  const [lotMode, setLotMode] = useState<"new" | "existing">("new");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const itemLots = lots.filter((l) => l.itemId === itemId);
  const item = items.find((i) => i.id === itemId);
  const uom = item ? (t.has(`uom.${item.uom}`) ? t(`uom.${item.uom}`) : item.uom) : "";

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const str = (k: string) => {
      const v = String(d.get(k) ?? "").trim();
      return v === "" ? undefined : v;
    };
    const body = {
      type: "RECEIPT",
      itemId,
      locationId: str("locationId"),
      qty: str("qty")?.replace(",", "."),
      unitCost: str("unitCost")?.replace(",", "."),
      note: str("note"),
      ...(lotMode === "existing"
        ? { lotId: str("lotId") }
        : {
            newLot: {
              lotNo: str("lotNo"),
              expiryDate: str("expiryDate"),
              mfgDate: str("mfgDate"),
              supplierLotNo: str("supplierLotNo"),
            },
          }),
    };
    setBusy(true);
    setError(null);
    try {
      await apiPost("/stock/movements", body);
      router.push(`/stok/kalem/${itemId}`);
      router.refresh();
    } catch (err) {
      const issue =
        err instanceof ClientApiError
          ? (err.body as { issues?: { message: string }[] }).issues?.[0]
          : undefined;
      setError(
        issue?.message ??
          (err instanceof ClientApiError && err.message ? err.message : t("form.genericError")),
      );
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-label={t("receiptTitle")}
      className="flex max-w-2xl flex-col gap-4 rounded-[16px] border border-line bg-surface p-5"
    >
      <p className="m-0 rounded-[9px] bg-warn-bg px-3 py-2 text-[12.5px] text-warn">
        {t("form.receiptHint")}
      </p>
      <label className={labelCls}>
        {t("form.item")}
        <select className={inputCls} value={itemId} onChange={(e) => setItemId(e.target.value)} required>
          <option value="">{t("form.choose")}</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.code} · {i.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelCls}>
          {t("form.location")}
          <select name="locationId" className={inputCls} required defaultValue="">
            <option value="">{t("form.choose")}</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          {t("form.qty")} {uom && `(${uom})`}
          <input name="qty" inputMode="decimal" pattern="\d+([.,]\d{1,4})?" required className={inputCls} />
        </label>
      </div>

      <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
        <legend className="mb-1 text-[13px] font-semibold">{t("form.lot")}</legend>
        <div className="flex gap-4 text-[13px]">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="lotMode"
              checked={lotMode === "new"}
              onChange={() => setLotMode("new")}
            />{" "}
            {t("form.newLot")}
          </label>
          {itemLots.length > 0 && (
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                name="lotMode"
                checked={lotMode === "existing"}
                onChange={() => setLotMode("existing")}
              />{" "}
              {t("form.existingLot")}
            </label>
          )}
        </div>
        {lotMode === "existing" && itemLots.length > 0 ? (
          <select name="lotId" className={inputCls} required aria-label={t("form.lot")}>
            {itemLots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.lotNo}
              </option>
            ))}
          </select>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelCls}>
              {t("form.lotNo")}
              <input name="lotNo" required maxLength={40} className={inputCls} />
            </label>
            <label className={labelCls}>
              {t("form.supplierLot")}
              <input name="supplierLotNo" maxLength={60} className={inputCls} />
            </label>
            <label className={labelCls}>
              {t("form.mfg")}
              <input name="mfgDate" type="date" className={inputCls} />
            </label>
            <label className={labelCls}>
              {t("form.expiry")}
              <input name="expiryDate" type="date" className={inputCls} />
            </label>
          </div>
        )}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelCls}>
          {t("form.unitCost")}
          <input name="unitCost" inputMode="decimal" pattern="\d+([.,]\d{1,4})?" className={inputCls} />
        </label>
        <label className={labelCls}>
          {t("form.note")}
          <input name="note" maxLength={500} className={inputCls} />
        </label>
      </div>

      {error && (
        <p role="alert" className={alertErr}>
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className={`${primaryBtn} self-start`}>
        {busy ? t("form.saving") : t("form.save")}
      </button>
    </form>
  );
}
