"use client";

import { type LoginResponse } from "@atelier/shared";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import { type FormEvent, useEffect, useState } from "react";
import { apiPost, ClientApiError } from "@/lib/api-client";

type Step =
  | { kind: "password" }
  | { kind: "mfa"; challenge: string }
  | { kind: "enroll"; challenge: string; otpauthUrl: string; secret: string };

const input =
  "min-h-11 w-full rounded-[9px] border border-line bg-surface px-3 text-[14px] text-text outline-none focus:border-gold-2";
const button =
  "inline-flex min-h-11 w-full items-center justify-center rounded-[9px] bg-ink px-4 text-[14px] font-semibold text-on-ink disabled:opacity-60";

/** İki adımlı giriş: parola → TOTP (ilk girişte TOTP kurulumu zorunlu, YTK-04). */
export function LoginForm() {
  const t = useTranslations("login");
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "password" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (step.kind !== "enroll") return;
    QRCode.toDataURL(step.otpauthUrl, { margin: 1, width: 200 }).then(setQr, () => setQr(null));
  }, [step]);

  const fail = (e: unknown) =>
    setError(e instanceof ClientApiError && e.message ? e.message : t("genericError"));

  async function onPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost<LoginResponse>("/auth/login", {
        email: form.get("email"),
        password: form.get("password"),
      });
      setStep(
        res.status === "MFA_ENROLL" ? { kind: "enroll", ...res } : { kind: "mfa", challenge: res.challenge },
      );
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function onCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (step.kind === "password") return;
    const code = String(new FormData(e.currentTarget).get("code") ?? "").replace(/\s/g, "");
    setBusy(true);
    setError(null);
    try {
      await apiPost("/auth/mfa/verify", { client: "web", challenge: step.challenge, code });
      router.replace("/");
      router.refresh();
    } catch (err) {
      // Süresi dolan doğrulamada baştan başla
      if (err instanceof ClientApiError && err.status === 401 && /süresi doldu/i.test(err.message))
        setStep({ kind: "password" });
      fail(err);
      setBusy(false);
    }
  }

  const errorBox = error && (
    <p role="alert" className="m-0 rounded-[9px] bg-bad-bg px-3 py-2 text-[13px] text-bad">
      {error}
    </p>
  );

  return (
    <section className="flex flex-col gap-4 rounded-[16px] border border-line bg-surface p-6">
      {step.kind === "password" ? (
        <>
          <div className="flex flex-col gap-1">
            <h1 className="m-0 font-display text-[24px] font-semibold">{t("title")}</h1>
            <p className="m-0 text-[13px] text-muted">{t("subtitle")}</p>
          </div>
          <form onSubmit={onPassword} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
              {t("email")}
              <input name="email" type="email" autoComplete="username" required className={input} />
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
              {t("password")}
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className={input}
              />
            </label>
            {errorBox}
            <button type="submit" disabled={busy} className={button}>
              {busy ? t("submitting") : t("submit")}
            </button>
          </form>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <h1 className="m-0 font-display text-[24px] font-semibold">
              {step.kind === "enroll" ? t("enrollTitle") : t("mfaTitle")}
            </h1>
            <p className="m-0 text-[13px] leading-relaxed text-muted">
              {step.kind === "enroll" ? t("enrollSubtitle") : t("mfaSubtitle")}
            </p>
          </div>
          {step.kind === "enroll" && (
            <div className="flex flex-col items-center gap-3 rounded-[12px] bg-surface-soft p-4">
              {qr && (
                // eslint-disable-next-line @next/next/no-img-element -- data: URL, optimize edilecek bir dosya yok
                <img src={qr} alt={t("qrAlt")} width={200} height={200} className="rounded-lg bg-white" />
              )}
              <p className="m-0 text-center text-xs text-text-2">{t("manualKey")}</p>
              <code className="rounded-md bg-surface px-2 py-1 text-[13px] tracking-wider break-all select-all">
                {step.secret}
              </code>
            </div>
          )}
          <form onSubmit={onCode} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
              {t("code")}
              <input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]{6,7}"
                maxLength={7}
                required
                autoFocus
                className={`${input} num text-center text-[20px] tracking-[0.3em]`}
              />
            </label>
            {errorBox}
            <button type="submit" disabled={busy} className={button}>
              {busy ? t("verifying") : t("verify")}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep({ kind: "password" });
                setError(null);
              }}
              className="min-h-10 text-[13px] font-semibold text-gold-text hover:text-gold-hover"
            >
              {t("back")}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
