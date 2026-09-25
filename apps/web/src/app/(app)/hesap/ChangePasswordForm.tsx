"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { alertErr, alertOk, inputCls, labelCls, primaryBtn } from "@/components/ui";
import { apiPost, ClientApiError } from "@/lib/api-client";

export function ChangePasswordForm() {
  const t = useTranslations("account");
  const tc = useTranslations("common");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const newPassword = String(data.get("newPassword") ?? "");
    if (newPassword !== String(data.get("confirmPassword") ?? "")) {
      setMsg({ ok: false, text: t("mismatch") });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await apiPost("/auth/password", { currentPassword: data.get("currentPassword"), newPassword });
      form.reset();
      setMsg({ ok: true, text: t("saved") });
    } catch (err) {
      const issue =
        (err instanceof ClientApiError &&
          (err.body as { issues?: { message: string }[] }).issues?.[0]?.message) ||
        null;
      setMsg({
        ok: false,
        text: issue ?? (err instanceof ClientApiError && err.message ? err.message : tc("error")),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label className={labelCls}>
        {t("currentPassword")}
        <input
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          className={inputCls}
        />
      </label>
      <label className={labelCls}>
        {t("newPassword")}
        <input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          className={inputCls}
        />
      </label>
      <label className={labelCls}>
        {t("confirmPassword")}
        <input
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          className={inputCls}
        />
      </label>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? alertOk : alertErr}>
          {msg.text}
        </p>
      )}
      <button type="submit" disabled={busy} className={`${primaryBtn} self-start`}>
        {busy ? t("saving") : t("save")}
      </button>
    </form>
  );
}
