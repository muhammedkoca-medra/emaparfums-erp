"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { alertErr, alertOk, inputCls, labelCls, primaryBtn, secondaryBtn } from "@/components/ui";
import { apiPost, errorText } from "@/lib/api-client";

interface Ref {
  id: string;
  label: string;
  code?: string;
}

/** E-ticaret aksiyonları: ürün listele, sipariş çek (simüle), stok it. */
export function EcommerceActions({ channels, products }: { channels: Ref[]; products: Ref[] }) {
  const t = useTranslations("ecommerce");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: errorText(err, ok) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        aria-label={t("listProduct")}
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          void run(() => apiPost("/ecommerce/listings", { channelId: d.get("channelId"), productId: d.get("productId") }), t("listed"));
        }}
        className="flex flex-col gap-2 rounded-[14px] border border-line bg-surface p-4"
      >
        <h3 className="m-0 font-display text-[15px] font-semibold">{t("listProduct")}</h3>
        <label className={labelCls}>
          {t("form.channel")}
          <select name="channelId" required className={inputCls} defaultValue="">
            <option value="" disabled>
              {t("form.choose")}
            </option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          {t("form.product")}
          <select name="productId" required className={inputCls} defaultValue="">
            <option value="" disabled>
              {t("form.choose")}
            </option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={busy} className={`${primaryBtn} self-start`}>
          {t("form.submit")}
        </button>
      </form>

      <form
        aria-label={t("syncOrder")}
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          const code = String(d.get("code"));
          void run(
            () =>
              apiPost(`/ecommerce/channels/${code}/sync-orders`, {
                externalOrderNo: d.get("extNo"),
                sku: d.get("sku"),
                qty: Number(d.get("qty")),
                unitPriceGross: String(d.get("price") ?? "").replace(",", "."),
              }),
            t("pulled"),
          );
        }}
        className="flex flex-col gap-2 rounded-[14px] border border-line bg-surface p-4"
      >
        <h3 className="m-0 font-display text-[15px] font-semibold">{t("syncOrder")}</h3>
        <label className={labelCls}>
          {t("form.channel")}
          <select name="code" required className={inputCls} defaultValue="">
            <option value="" disabled>
              {t("form.choose")}
            </option>
            {channels.map((c) => (
              <option key={c.id} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className={labelCls}>
            {t("form.extNo")}
            <input name="extNo" required className={inputCls} />
          </label>
          <label className={labelCls}>
            {t("form.sku")}
            <input name="sku" required className={inputCls} />
          </label>
          <label className={labelCls}>
            {t("form.qty")}
            <input name="qty" type="number" min={1} required defaultValue={1} className={inputCls} />
          </label>
          <label className={labelCls}>
            {t("form.price")}
            <input name="price" inputMode="decimal" required className={inputCls} />
          </label>
        </div>
        <button type="submit" disabled={busy} className={`${secondaryBtn} self-start`}>
          {t("form.submit")}
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {channels.map((c) => (
          <button key={c.id} type="button" disabled={busy} className={secondaryBtn} onClick={() => run(() => apiPost(`/ecommerce/channels/${c.code}/push-stock`), t("pushed"))}>
            {c.label}: {t("pushStock")}
          </button>
        ))}
      </div>

      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? alertOk : alertErr}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
