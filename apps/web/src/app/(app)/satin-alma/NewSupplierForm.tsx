"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { alertErr, inputCls, labelCls, secondaryBtn } from "@/components/ui";
import { apiPost, errorText } from "@/lib/api-client";

export function NewSupplierForm() {
  const t = useTranslations("purchasing");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await apiPost("/purchasing/suppliers", {
        name: d.get("name"),
        taxNo: String(d.get("taxNo") ?? "").trim() || undefined,
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(errorText(err, t("save")));
    } finally {
      setBusy(false);
    }
  }

  if (!open)
    return (
      <button type="button" className={`${secondaryBtn} self-start`} onClick={() => setOpen(true)}>
        + {t("newSupplier")}
      </button>
    );

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2 rounded-[12px] border border-line-soft p-3">
      <label className={labelCls}>
        {t("supName")}
        <input name="name" required minLength={2} className={inputCls} />
      </label>
      <label className={labelCls}>
        {t("supTax")}
        <input name="taxNo" inputMode="numeric" className={inputCls} />
      </label>
      <button type="submit" disabled={busy} className={secondaryBtn}>
        {t("save")}
      </button>
      {error && (
        <p role="alert" className={alertErr}>
          {error}
        </p>
      )}
    </form>
  );
}
