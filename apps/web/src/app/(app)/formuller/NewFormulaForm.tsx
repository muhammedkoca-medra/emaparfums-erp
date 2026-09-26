"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { alertErr, inputCls, labelCls, primaryBtn } from "@/components/ui";
import { apiPost, errorText } from "@/lib/api-client";

export function NewFormulaForm() {
  const t = useTranslations("formulas");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const ifra = String(d.get("ifraCategory") ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost<{ id: string }>("/formulas", {
        code: d.get("code"),
        name: d.get("name"),
        concentrationPct: String(d.get("concentrationPct") ?? "").replace(",", "."),
        ...(ifra ? { ifraCategory: ifra } : {}),
      });
      router.push(`/formuller/${res.id}`);
    } catch (err) {
      setError(errorText(err, t("form.saved")));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} aria-label={t("new")} className="flex flex-col gap-3 self-start rounded-[16px] border border-line bg-surface p-5">
      <h2 className="m-0 font-display text-[19px] font-semibold">{t("new")}</h2>
      <label className={labelCls}>
        {t("form.code")}
        <input name="code" required className={inputCls} />
      </label>
      <label className={labelCls}>
        {t("form.name")}
        <input name="name" required minLength={2} className={inputCls} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={labelCls}>
          {t("form.concentration")}
          <input name="concentrationPct" inputMode="decimal" required className={inputCls} />
        </label>
        <label className={labelCls}>
          {t("form.ifraCategory")}
          <input name="ifraCategory" maxLength={10} className={inputCls} />
        </label>
      </div>
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
