"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { alertErr, alertOk, inputCls, labelCls, primaryBtn } from "@/components/ui";
import { apiPost, errorText } from "@/lib/api-client";

/** Yeni vergi kuralı taslak girilir; yayına alma ayrı yetkiyle (tax:APPROVE). */
export function NewTaxRuleForm() {
  const t = useTranslations("tax");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const d = new FormData(form);
    const opt = (k: string) => {
      const v = String(d.get(k) ?? "").trim();
      return v === "" ? null : v;
    };
    setBusy(true);
    setMsg(null);
    try {
      await apiPost("/tax/rules", {
        category: d.get("category"),
        gtipPrefix: opt("gtipPrefix"),
        kdvRate: String(d.get("kdvRate") ?? "").replace(",", "."),
        otvRate: String(d.get("otvRate") ?? "").replace(",", "."),
        otvList: opt("otvList"),
        note: opt("note"),
        validFrom: d.get("validFrom"),
      });
      form.reset();
      setMsg({ ok: true, text: t("form.saved") });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: errorText(err, t("form.saved")) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} aria-label={t("newRule")} className="flex flex-col gap-3 self-start rounded-[16px] border border-line bg-surface p-5">
      <h2 className="m-0 font-display text-[19px] font-semibold">{t("newRule")}</h2>
      <div className="grid grid-cols-2 gap-3">
        <label className={labelCls}>
          {t("form.category")}
          <input name="category" required className={inputCls} />
        </label>
        <label className={labelCls}>
          {t("form.gtipPrefix")}
          <input name="gtipPrefix" inputMode="numeric" className={inputCls} />
        </label>
        <label className={labelCls}>
          {t("form.kdv")}
          <input name="kdvRate" inputMode="decimal" required className={inputCls} />
        </label>
        <label className={labelCls}>
          {t("form.otv")}
          <input name="otvRate" inputMode="decimal" required className={inputCls} />
        </label>
        <label className={labelCls}>
          {t("form.otvList")}
          <input name="otvList" maxLength={10} className={inputCls} />
        </label>
        <label className={labelCls}>
          {t("form.validFrom")}
          <input name="validFrom" type="date" required className={inputCls} />
        </label>
      </div>
      <label className={labelCls}>
        {t("form.note")}
        <input name="note" maxLength={300} className={inputCls} />
      </label>
      <button type="submit" disabled={busy} className={`${primaryBtn} self-start`}>
        {t("form.create")}
      </button>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? alertOk : alertErr}>
          {msg.text}
        </p>
      )}
    </form>
  );
}
