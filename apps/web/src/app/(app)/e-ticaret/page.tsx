import { getTranslations } from "next-intl/server";
import { Pill, type Tone } from "@/components/Pill";
import { Topbar } from "@/components/Topbar";
import { apiGet, getMe } from "@/lib/api-server";
import { fmtDate } from "@/lib/format";
import { canView } from "@/lib/modules";
import { EcommerceActions } from "./EcommerceActions";

interface Channel {
  id: string;
  code: string;
  name: string;
  listings: number;
  orders: number;
}
interface Listing {
  id: string;
  status: string;
  externalId: string | null;
  priceSynced: boolean;
  stockSynced: boolean;
  contentScore: number | null;
  product: { sku: string; name: string };
  channel: { code: string; name: string };
  lastSyncAt: string | null;
}

const TONE: Record<string, Tone> = { NOT_LISTED: "neu", PENDING_APPROVAL: "warn", ACTIVE: "ok", PAUSED: "warn", ERROR: "bad" };

export default async function EcommercePage() {
  const t = await getTranslations("ecommerce");
  const tn = await getTranslations();
  const me = await getMe();
  if (!canView(me.permissions, "ecommerce")) {
    return (
      <>
        <Topbar heading={t("title")} />
        <p role="alert" className="mx-4 my-5 max-w-2xl rounded-[10px] bg-warn-bg px-4 py-3 text-[13px] text-warn sm:mx-8">
          {tn("placeholder.noAccess")}
        </p>
      </>
    );
  }
  const canEdit = me.permissions.includes("ecommerce:CREATE") || me.permissions.includes("ecommerce:EDIT");
  const [channels, listings, products] = await Promise.all([
    apiGet<Channel[]>("/ecommerce/channels"),
    apiGet<Listing[]>("/ecommerce/listings"),
    canEdit && canView(me.permissions, "sales") ? apiGet<{ id: string; sku: string; name: string; status: string }[]>("/catalog/products") : Promise.resolve([]),
  ]);
  const channelRefs = channels.map((c) => ({ id: c.id, label: c.name, code: c.code }));
  const productRefs = products.filter((p) => p.status === "ACTIVE").map((p) => ({ id: p.id, label: `${p.name} · ${p.sku}` }));
  const th = "px-2 py-2 text-left text-[11px] font-bold tracking-[0.08em] text-muted uppercase";
  const td = "border-t border-line-soft px-2 py-2.5";

  return (
    <>
      <Topbar heading={t("title")} sub={t("subtitle")} />
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-8">
        <p className="m-0 max-w-3xl text-xs text-muted">{t("note")}</p>
        <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {channels.map((c) => (
            <li key={c.id} className="flex flex-col gap-1 rounded-[16px] border border-line bg-surface p-4">
              <span className="font-display text-[17px] font-semibold">{c.name}</span>
              <span className="text-[13px] text-text-2">
                {t("chCol.listings")}: <span className="num font-semibold">{c.listings}</span> · {t("chCol.orders")}: <span className="num font-semibold">{c.orders}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="overflow-x-auto rounded-[16px] border border-line bg-surface p-5">
            <h2 className="m-0 mb-2 font-display text-[17px] font-semibold">{t("listings")}</h2>
            {listings.length === 0 ? (
              <p className="m-0 text-[13px] text-muted">{t("noListings")}</p>
            ) : (
              <table className="w-full min-w-[640px] border-collapse text-[13px]">
                <thead>
                  <tr>
                    <th className={th}>{t("lCol.product")}</th>
                    <th className={th}>{t("lCol.channel")}</th>
                    <th className={th}>{t("lCol.status")}</th>
                    <th className={`${th} text-center`}>{t("lCol.price")}</th>
                    <th className={`${th} text-center`}>{t("lCol.stock")}</th>
                    <th className={`${th} text-right`}>{t("lCol.score")}</th>
                    <th className={th}>{t("lCol.sync")}</th>
                  </tr>
                </thead>
                <tbody>
                  {listings.map((l) => (
                    <tr key={l.id}>
                      <td className={td}>
                        {l.product.name} <span className="num text-muted">{l.product.sku}</span>
                      </td>
                      <td className={td}>{l.channel.name}</td>
                      <td className={td}>
                        <Pill tone={TONE[l.status] ?? "neu"}>{t(`status.${l.status}`)}</Pill>
                      </td>
                      <td className={`${td} text-center`}>{l.priceSynced ? t("synced") : t("notSynced")}</td>
                      <td className={`${td} text-center`}>{l.stockSynced ? t("synced") : t("notSynced")}</td>
                      <td className={`${td} num text-right`}>{l.contentScore ?? "—"}</td>
                      <td className={`${td} num text-text-2`}>{l.lastSyncAt ? fmtDate(l.lastSyncAt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          {canEdit && <EcommerceActions channels={channelRefs} products={productRefs} />}
        </div>
      </div>
    </>
  );
}
