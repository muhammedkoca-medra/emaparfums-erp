"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { alertErr, alertOk, inputCls, labelCls, primaryBtn } from "@/components/ui";
import { apiPost, ClientApiError } from "@/lib/api-client";

export interface LotOption {
  id: string;
  lotNo: string;
  qcStatus: string;
  locations: { id: string; code: string; onHand: string }[];
}

type Tab = "adjust" | "transfer" | "reserve" | "qc";

const errText = (err: unknown, fallback: string) => {
  if (!(err instanceof ClientApiError)) return fallback;
  const issue = (err.body as { issues?: { message: string }[] }).issues?.[0];
  return issue?.message ?? (err.message || fallback);
};

/** Kalem üzerinde elle işlemler: düzeltme, transfer, rezervasyon, kalite durumu. */
export function ItemActions({
  itemId,
  uom,
  lots,
  locations,
  warehouses,
  canMove,
  canQc,
}: {
  itemId: string;
  uom: string;
  lots: LotOption[];
  locations: { id: string; label: string }[];
  warehouses: { id: string; name: string }[];
  canMove: boolean;
  canQc: boolean;
}) {
  const t = useTranslations("stock");
  const router = useRouter();
  const tabs = [
    ...(canMove ? (["adjust", "transfer", "reserve"] as const) : []),
    ...(canQc ? (["qc"] as const) : []),
  ];
  const [tab, setTab] = useState<Tab>(tabs[0] ?? "adjust");
  const [lotId, setLotId] = useState(lots[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const lot = lots.find((l) => l.id === lotId);

  async function submit(e: FormEvent<HTMLFormElement>, build: (d: FormData) => [string, unknown]) {
    e.preventDefault();
    const form = e.currentTarget;
    const [path, body] = build(new FormData(form));
    setBusy(true);
    setMsg(null);
    try {
      await apiPost(path, body);
      form.reset();
      setMsg({ ok: true, text: t("form.saved") });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: errText(err, t("form.genericError")) });
    } finally {
      setBusy(false);
    }
  }

  const lotSelect = (
    <label className={labelCls}>
      {t("form.lot")}
      <select className={inputCls} value={lotId} onChange={(e) => setLotId(e.target.value)} required>
        {lots.map((l) => (
          <option key={l.id} value={l.id}>
            {l.lotNo} · {t(`qc.${l.qcStatus}`)}
          </option>
        ))}
      </select>
    </label>
  );
  const lotLocationSelect = (name: string, label: string) => (
    <label className={labelCls}>
      {label}
      <select name={name} className={inputCls} required>
        {lot?.locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.code} ({l.onHand} {uom})
          </option>
        ))}
      </select>
    </label>
  );
  const qtyInput = (
    <label className={labelCls}>
      {t("form.qty")} ({uom})
      <input name="qty" inputMode="decimal" pattern="\d+([.,]\d{1,4})?" required className={inputCls} />
    </label>
  );
  const qty = (d: FormData) => String(d.get("qty") ?? "").replace(",", ".");

  return (
    <section className="flex flex-col gap-3 rounded-[16px] border border-line bg-surface p-5">
      <h2 className="m-0 font-display text-[19px] font-semibold">{t("item.actions")}</h2>
      <div role="tablist" className="flex flex-wrap gap-1.5">
        {tabs.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => {
              setTab(k);
              setMsg(null);
            }}
            className={`min-h-9 rounded-[9px] border px-3 text-[12.5px] font-semibold ${
              tab === k ? "border-ink bg-ink text-on-ink" : "border-line bg-surface text-text-2"
            }`}
          >
            {t(
              k === "adjust"
                ? "form.adjust"
                : k === "transfer"
                  ? "form.transfer"
                  : k === "reserve"
                    ? "form.reserve"
                    : "form.qcTitle",
            )}
          </button>
        ))}
      </div>

      {lots.length === 0 && tab !== "reserve" ? (
        <p className="m-0 text-[13px] text-muted">{t("item.noLots")}</p>
      ) : tab === "adjust" ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) =>
            submit(e, (d) => [
              "/stock/movements",
              {
                type: "ADJUSTMENT",
                itemId,
                lotId,
                locationId: d.get("locationId"),
                direction: d.get("direction"),
                qty: qty(d),
                note: d.get("note"),
              },
            ])
          }
        >
          {lotSelect}
          {lotLocationSelect("locationId", t("form.location"))}
          <fieldset className="m-0 flex gap-4 border-0 p-0 text-[13px]">
            <legend className="mb-1 font-semibold">{t("form.direction")}</legend>
            <label className="flex items-center gap-1.5">
              <input type="radio" name="direction" value="INCREASE" defaultChecked /> {t("form.increase")}
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" name="direction" value="DECREASE" /> {t("form.decrease")}
            </label>
          </fieldset>
          {qtyInput}
          <label className={labelCls}>
            {t("form.note")}
            <input name="note" required minLength={3} className={inputCls} />
          </label>
          <button type="submit" disabled={busy} className={`${primaryBtn} self-start`}>
            {busy ? t("form.saving") : t("form.save")}
          </button>
        </form>
      ) : tab === "transfer" ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) =>
            submit(e, (d) => [
              "/stock/movements",
              {
                type: "TRANSFER",
                itemId,
                lotId,
                fromLocationId: d.get("fromLocationId"),
                toLocationId: d.get("toLocationId"),
                qty: qty(d),
                ...(d.get("note") ? { note: d.get("note") } : {}),
              },
            ])
          }
        >
          {lotSelect}
          {lotLocationSelect("fromLocationId", t("form.fromLocation"))}
          <label className={labelCls}>
            {t("form.toLocation")}
            <select name="toLocationId" className={inputCls} required>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          {qtyInput}
          <label className={labelCls}>
            {t("form.note")}
            <input name="note" className={inputCls} />
          </label>
          <button type="submit" disabled={busy} className={`${primaryBtn} self-start`}>
            {busy ? t("form.saving") : t("form.save")}
          </button>
        </form>
      ) : tab === "reserve" ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) =>
            submit(e, (d) => [
              "/stock/reservations",
              {
                itemId,
                qty: qty(d),
                note: d.get("note"),
                ...(d.get("warehouseId") ? { warehouseId: d.get("warehouseId") } : {}),
              },
            ])
          }
        >
          <p className="m-0 text-xs text-muted">{t("form.reserveHint")}</p>
          {qtyInput}
          <label className={labelCls}>
            {t("form.warehouse")}
            <select name="warehouseId" className={inputCls}>
              <option value="">{t("form.anyWarehouse")}</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            {t("form.note")}
            <input name="note" required minLength={3} className={inputCls} />
          </label>
          <button type="submit" disabled={busy} className={`${primaryBtn} self-start`}>
            {busy ? t("form.saving") : t("form.save")}
          </button>
        </form>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) =>
            submit(e, (d) => [
              `/stock/lots/${lotId}/qc`,
              { status: d.get("status"), reason: d.get("reason") },
            ])
          }
        >
          {lotSelect}
          <label className={labelCls}>
            {t("form.qcStatus")}
            <select name="status" className={inputCls} defaultValue="RELEASED">
              {(["RELEASED", "QUARANTINE", "REJECTED"] as const).map((s) => (
                <option key={s} value={s}>
                  {t(`qc.${s}`)}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            {t("form.reason")}
            <input name="reason" required minLength={3} className={inputCls} />
          </label>
          <button type="submit" disabled={busy} className={`${primaryBtn} self-start`}>
            {busy ? t("form.saving") : t("form.save")}
          </button>
        </form>
      )}

      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? alertOk : alertErr}>
          {msg.text}
        </p>
      )}
    </section>
  );
}
