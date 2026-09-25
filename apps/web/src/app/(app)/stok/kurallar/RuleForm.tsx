"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { alertErr, alertOk, inputCls, labelCls, primaryBtn } from "@/components/ui";
import { apiPut, errorText } from "@/lib/api-client";

export function RuleForm({
  ruleKey,
  label,
  value,
  defaultValue,
  canEdit,
}: {
  ruleKey: string;
  label: string;
  value: string;
  defaultValue: string;
  canEdit: boolean;
}) {
  const t = useTranslations("stock");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Tutar eşiği metin (Decimal), diğerleri tam sayı
  const isMoney = ruleKey === "stock.countApprovalThreshold";

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const raw = String(new FormData(e.currentTarget).get("value") ?? "").replace(",", ".");
    setBusy(true);
    setMsg(null);
    try {
      await apiPut(`/stock/rules/${ruleKey}`, { value: isMoney ? raw : Number(raw) });
      setMsg({ ok: true, text: t("rules.saved") });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: errorText(err, t("form.genericError")) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-2 rounded-[16px] border border-line bg-surface p-4"
    >
      <label className={labelCls}>
        {label}
        <input
          name="value"
          defaultValue={value}
          inputMode="decimal"
          required
          disabled={!canEdit}
          className={inputCls}
        />
      </label>
      <span className="text-xs text-muted">{t("rules.default", { value: defaultValue })}</span>
      {canEdit && (
        <button type="submit" disabled={busy} className={`${primaryBtn} self-start`}>
          {busy ? t("form.saving") : t("form.save")}
        </button>
      )}
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? alertOk : alertErr}>
          {msg.text}
        </p>
      )}
    </form>
  );
}
