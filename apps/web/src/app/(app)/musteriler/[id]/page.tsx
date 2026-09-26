import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Pill } from "@/components/Pill";
import { Topbar } from "@/components/Topbar";
import { ApiError, apiGet, getMe } from "@/lib/api-server";
import { fmtDate, fmtMoney } from "@/lib/format";
import { ConsentControls } from "./ConsentControls";

interface Customer360 {
  id: string;
  type: "INDIVIDUAL" | "CORPORATE";
  fullName: string;
  email: string | null;
  phone: string | null;
  taxNo: string | null;
  taxOffice: string | null;
  isEInvoiceUser: boolean;
  kvkkConsentAt: string | null;
  marketingConsentAt: string | null;
  addresses: { id: string; label: string | null; line1: string; district: string; city: string; postalCode: string | null }[];
  consents: { id: string; purpose: string; granted: boolean; channel: string; textVersion: string; createdAt: string }[];
  counts: { orders: number; invoices: number; subscriptions: number };
  loyalty: { points: number; tier: string } | null;
  recentOrders: { id: string; number: string; status: string; grandTotal: string; createdAt: string }[];
}

export default async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("customers");
  const me = await getMe();
  let c: Customer360;
  try {
    c = await apiGet<Customer360>(`/customers/${encodeURIComponent(id)}/360`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }
  const canEdit = me.permissions.includes("sales:EDIT");
  const card = "flex flex-col gap-3 rounded-[16px] border border-line bg-surface p-5";
  const dt = "text-[12px] text-muted";
  const dd = "m-0 text-[14px] font-medium";

  return (
    <>
      <Topbar
        heading={c.fullName}
        sub={t(`type.${c.type}`)}
        action={c.loyalty ? <Pill tone="ok">{c.loyalty.tier} · {c.loyalty.points}</Pill> : undefined}
      />
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-8">
        <Link href="/musteriler" className="self-start text-[13px] font-semibold">
          ← {t("back")}
        </Link>

        <div className="grid gap-4 lg:grid-cols-3">
          <section className={card}>
            <h2 className="m-0 font-display text-[17px] font-semibold">{t("section.contact")}</h2>
            <dl className="m-0 grid grid-cols-2 gap-3">
              <div>
                <dt className={dt}>{t("col.email")}</dt>
                <dd className={dd}>{c.email ?? "—"}</dd>
              </div>
              <div>
                <dt className={dt}>{t("col.phone")}</dt>
                <dd className={`${dd} num`}>{c.phone ?? "—"}</dd>
              </div>
              <div>
                <dt className={dt}>{t("col.taxNo")}</dt>
                <dd className={`${dd} num`}>{c.taxNo ?? "—"}</dd>
              </div>
              <div>
                <dt className={dt}>{t("form.taxOffice")}</dt>
                <dd className={dd}>{c.taxOffice ?? "—"}</dd>
              </div>
            </dl>
          </section>

          <section className={card}>
            <h2 className="m-0 font-display text-[17px] font-semibold">{t("consent.title")}</h2>
            <ConsentControls customerId={c.id} kvkk={!!c.kvkkConsentAt} marketing={!!c.marketingConsentAt} canEdit={canEdit} />
          </section>

          <section className={card}>
            <h2 className="m-0 font-display text-[17px] font-semibold">{t("section.orders")}</h2>
            <dl className="m-0 grid grid-cols-3 gap-2 text-center">
              {(["orders", "invoices", "subscriptions"] as const).map((k) => (
                <div key={k} className="rounded-[10px] bg-surface-soft px-2 py-2">
                  <dt className={dt}>{t(`counts.${k}`)}</dt>
                  <dd className="num m-0 font-display text-[22px] font-semibold">{c.counts[k]}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className={card}>
            <h2 className="m-0 font-display text-[17px] font-semibold">{t("section.orders")}</h2>
            {c.recentOrders.length === 0 ? (
              <p className="m-0 text-[13px] text-muted">{t("noOrders")}</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]">
                {c.recentOrders.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2 border-t border-line-soft py-1.5 first:border-t-0">
                    <span className="num font-semibold">{o.number}</span>
                    <span className="text-text-2">{o.status}</span>
                    <span className="num">{fmtMoney(o.grandTotal)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={card}>
            <h2 className="m-0 font-display text-[17px] font-semibold">{t("section.addresses")}</h2>
            {c.addresses.length === 0 ? (
              <p className="m-0 text-[13px] text-muted">{t("noAddress")}</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[13px]">
                {c.addresses.map((a) => (
                  <li key={a.id} className="rounded-[10px] border border-line-soft px-3 py-2">
                    {a.label && <span className="mr-2 font-semibold">{a.label}</span>}
                    {a.line1}, {a.district}/{a.city} {a.postalCode ?? ""}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className={card}>
          <h2 className="m-0 font-display text-[17px] font-semibold">{t("section.consents")}</h2>
          {c.consents.length === 0 ? (
            <p className="m-0 text-[13px] text-muted">—</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
              {c.consents.map((r) => (
                <li key={r.id} className="flex items-center gap-3 border-t border-line-soft py-1.5 first:border-t-0">
                  <span className="num text-muted">{fmtDate(r.createdAt)}</span>
                  <span className="font-semibold">{r.purpose === "KVKK" ? t("consent.kvkk") : t("consent.marketing")}</span>
                  <Pill tone={r.granted ? "ok" : "neu"}>{r.granted ? t("consent.granted") : t("consent.none")}</Pill>
                  <span className="text-text-2">
                    {t("consent.channel")}: {r.channel} · {r.textVersion}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
