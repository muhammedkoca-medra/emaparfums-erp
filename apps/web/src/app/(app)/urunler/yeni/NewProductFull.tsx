"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useRef, useState } from "react";
import { alertErr, inputCls, labelCls, primaryBtn, secondaryBtn } from "@/components/ui";
import { apiPost, apiPut, ClientApiError, errorText } from "@/lib/api-client";
import { fileToResizedDataUrl } from "../_components/image";
import { emptyScentProfile, ScentProfileFields, type ScentProfileForm } from "../_components/ScentProfileFields";

const CONCENTRATIONS = ["EXTRAIT", "EDP", "EDT", "EDC", "COLOGNE", "OTHER"] as const;
const STATUSES = ["ACTIVE", "DRAFT", "SALES_LOCKED", "DISCONTINUED"] as const;

/** SKU'dan mamul kalem kodu üretir (EMAK025 → EM-EMAK025). Kullanıcı düzenleyebilir. */
function deriveItemCode(sku: string): string {
  const s = sku.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return s ? `EM-${s.slice(0, 10)}` : "";
}

/** Tek ekranda tam ürün: görsel + ticari bilgi + vitrin koku profili. POST /catalog/products/full. */
export function NewProductFull({ categories }: { categories: string[] }) {
  const t = useTranslations("catalog");
  const tf = useTranslations("catalog.form");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [itemCode, setItemCode] = useState("");
  const [itemName, setItemName] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [itemNameTouched, setItemNameTouched] = useState(false);
  const [profile, setProfile] = useState<ScentProfileForm>(emptyScentProfile);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSkuChange(v: string) {
    setSku(v);
    if (!codeTouched) setItemCode(deriveItemCode(v));
  }
  function onNameChange(v: string) {
    setName(v);
    if (!itemNameTouched) setItemName(v);
  }

  async function onPickImage(file: File) {
    setError(null);
    try {
      setDataUrl(await fileToResizedDataUrl(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : tf("saved"));
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const barcode = String(d.get("barcode") ?? "").trim();
    const accords = profile.accords.map((a) => ({ label: a.label.trim(), strength: a.strength })).filter((a) => a.label.length > 0);
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost<{ id: string }>("/catalog/products/full", {
        itemCode,
        itemName,
        sku,
        name,
        concentration: d.get("concentration"),
        volumeMl: Number(d.get("volumeMl")),
        gtip: d.get("gtip"),
        taxCategory: d.get("taxCategory"),
        status: d.get("status"),
        scentProfile: { gender: profile.gender, accords, dayPct: profile.dayPct, seasons: profile.seasons, source: "manual" },
        ...(barcode ? { barcode } : {}),
      });
      if (dataUrl) {
        await apiPut(`/catalog/products/${res.id}/image`, { dataUrl }).catch(() => null);
      }
      router.push(`/urunler/${res.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error && !(err instanceof ClientApiError) ? err.message : errorText(err, tf("saved")));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5 xl:grid-cols-2">
      {/* Sol: görsel + ticari bilgi */}
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-5">
          <h2 className="m-0 font-display text-[17px] font-semibold">{t("image.title")}</h2>
          <div className="relative aspect-square w-full overflow-hidden rounded-[14px] border border-line-soft bg-surface-soft">
            {dataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- yerel önizleme (data URL), optimize gerekmez
              <img src={dataUrl} alt="" className="absolute inset-0 h-full w-full object-contain p-2" />
            ) : (
              <div className="flex h-full items-center justify-center text-[13px] text-muted">{t("image.none")}</div>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPickImage(f);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryBtn} onClick={() => inputRef.current?.click()}>
              {dataUrl ? t("image.replace") : t("image.upload")}
            </button>
            {dataUrl && (
              <button type="button" className={secondaryBtn} onClick={() => setDataUrl(null)}>
                {t("image.remove")}
              </button>
            )}
          </div>
          <p className="m-0 text-[11.5px] text-muted">{t("image.hint")}</p>
        </section>

        <section className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-5">
          <h2 className="m-0 font-display text-[17px] font-semibold">{tf("identity")}</h2>
          <label className={labelCls}>
            {tf("name")}
            <input required minLength={2} value={name} onChange={(e) => onNameChange(e.target.value)} className={inputCls} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelCls}>
              {tf("sku")}
              <input required value={sku} onChange={(e) => onSkuChange(e.target.value)} className={inputCls} placeholder="EMAK025" />
            </label>
            <label className={labelCls}>
              {tf("status")}
              <select name="status" defaultValue="ACTIVE" className={inputCls}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`status.${s}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelCls}>
              {tf("volume")}
              <input name="volumeMl" type="number" min={1} max={5000} defaultValue={50} required className={inputCls} />
            </label>
            <label className={labelCls}>
              {tf("concentration")}
              <select name="concentration" defaultValue="EDP" className={inputCls}>
                {CONCENTRATIONS.map((c) => (
                  <option key={c} value={c}>
                    {t(`concentration.${c}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelCls}>
              {tf("gtip")}
              <input name="gtip" required defaultValue="3303.00" className={inputCls} />
            </label>
            <label className={labelCls}>
              {tf("taxCategory")}
              <select name="taxCategory" required className={inputCls} defaultValue={categories[0] ?? ""}>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className={labelCls}>
            {tf("barcode")}
            <input name="barcode" inputMode="numeric" maxLength={13} className={inputCls} />
          </label>
          <details className="rounded-[10px] bg-surface-soft px-3 py-2">
            <summary className="cursor-pointer text-[12.5px] font-semibold text-text-2">{tf("itemAdvanced")}</summary>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className={labelCls}>
                {tf("itemCode")}
                <input
                  value={itemCode}
                  onChange={(e) => {
                    setCodeTouched(true);
                    setItemCode(e.target.value.toUpperCase());
                  }}
                  required
                  className={inputCls}
                  placeholder="EM-EMAK025"
                />
              </label>
              <label className={labelCls}>
                {tf("itemName")}
                <input
                  value={itemName}
                  onChange={(e) => {
                    setItemNameTouched(true);
                    setItemName(e.target.value);
                  }}
                  required
                  minLength={2}
                  className={inputCls}
                />
              </label>
            </div>
            <p className="m-0 mt-2 text-[11px] text-muted">{tf("itemAdvancedHint")}</p>
          </details>
        </section>
      </div>

      {/* Sağ: vitrin koku profili */}
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-4 rounded-[18px] border border-line bg-surface p-5">
          <div className="flex flex-col gap-1">
            <h2 className="m-0 font-display text-[17px] font-semibold">{t("profile.title")}</h2>
            <p className="m-0 text-[12px] text-muted">{t("profile.intro")}</p>
          </div>
          <ScentProfileFields value={profile} onChange={setProfile} />
        </section>

        {error && (
          <p role="alert" className={alertErr}>
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button type="submit" disabled={busy} className={primaryBtn}>
            {busy ? tf("saving") : t("createCta")}
          </button>
          <button type="button" className={secondaryBtn} onClick={() => router.push("/urunler")}>
            {tf("cancel")}
          </button>
        </div>
      </div>
    </form>
  );
}
