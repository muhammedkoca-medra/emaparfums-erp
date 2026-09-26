"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { alertErr, inputCls, labelCls, primaryBtn } from "@/components/ui";
import { apiPost, errorText } from "@/lib/api-client";

/** Yeni müşteri + KVKK rızası + isteğe bağlı adres. PII API'de şifrelenir. */
export function NewCustomerForm() {
  const t = useTranslations("customers");
  const router = useRouter();
  const [type, setType] = useState<"INDIVIDUAL" | "CORPORATE">("INDIVIDUAL");
  const [withAddress, setWithAddress] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const opt = (k: string) => {
      const v = String(d.get(k) ?? "").trim();
      return v === "" ? undefined : v;
    };
    setBusy(true);
    setError(null);
    try {
      const address =
        withAddress && opt("line1")
          ? { line1: d.get("line1"), district: d.get("district"), city: d.get("city"), postalCode: opt("postalCode") }
          : undefined;
      const res = await apiPost<{ id: string }>("/customers", {
        type,
        fullName: d.get("fullName"),
        email: opt("email"),
        phone: opt("phone"),
        taxNo: opt("taxNo"),
        taxOffice: opt("taxOffice"),
        isEInvoiceUser: d.get("isEInvoiceUser") === "on",
        kvkkConsent: d.get("kvkkConsent") === "on",
        marketingConsent: d.get("marketingConsent") === "on",
        consentChannel: "WEB",
        ...(address ? { address } : {}),
      });
      router.push(`/musteriler/${res.id}`);
    } catch (err) {
      setError(errorText(err, t("form.saved")));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} aria-label={t("new")} className="flex flex-col gap-3 self-start rounded-[16px] border border-line bg-surface p-5">
      <h2 className="m-0 font-display text-[19px] font-semibold">{t("new")}</h2>
      <label className={labelCls}>
        {t("form.type")}
        <select className={inputCls} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="INDIVIDUAL">{t("type.INDIVIDUAL")}</option>
          <option value="CORPORATE">{t("type.CORPORATE")}</option>
        </select>
      </label>
      <label className={labelCls}>
        {t("form.fullName")}
        <input name="fullName" required minLength={2} className={inputCls} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={labelCls}>
          {t("form.email")}
          <input name="email" type="email" className={inputCls} />
        </label>
        <label className={labelCls}>
          {t("form.phone")}
          <input name="phone" inputMode="tel" className={inputCls} />
        </label>
        <label className={labelCls}>
          {t("form.taxNo")}
          <input name="taxNo" inputMode="numeric" className={inputCls} />
        </label>
        <label className={labelCls}>
          {t("form.taxOffice")}
          <input name="taxOffice" className={inputCls} />
        </label>
      </div>
      <label className="flex min-h-9 items-center gap-2 text-[13px]">
        <input type="checkbox" name="isEInvoiceUser" className="h-4 w-4 accent-[#1c1815]" />
        {t("form.isEInvoiceUser")}
      </label>
      <div className="flex flex-col gap-1.5 rounded-[10px] bg-surface-soft p-3">
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" name="kvkkConsent" className="h-4 w-4 accent-[#1c1815]" />
          {t("form.kvkk")}
        </label>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" name="marketingConsent" className="h-4 w-4 accent-[#1c1815]" />
          {t("form.marketing")}
        </label>
      </div>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={withAddress} onChange={(e) => setWithAddress(e.target.checked)} className="h-4 w-4 accent-[#1c1815]" />
        {t("form.addressTitle")}
      </label>
      {withAddress && (
        <div className="flex flex-col gap-3 rounded-[10px] border border-line-soft p-3">
          <label className={labelCls}>
            {t("form.line1")}
            <input name="line1" className={inputCls} />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className={labelCls}>
              {t("form.district")}
              <input name="district" className={inputCls} />
            </label>
            <label className={labelCls}>
              {t("form.city")}
              <input name="city" className={inputCls} />
            </label>
            <label className={labelCls}>
              {t("form.postalCode")}
              <input name="postalCode" inputMode="numeric" className={inputCls} />
            </label>
          </div>
        </div>
      )}
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
