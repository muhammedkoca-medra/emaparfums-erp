import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Topbar } from "@/components/Topbar";
import { ApiError, apiGet, getMe } from "@/lib/api-server";
import { fmtMoney } from "@/lib/format";
import { ShipStatusPill } from "../ShipStatusPill";
import { TrackButton } from "./TrackButton";

interface Shipment {
  id: string;
  trackingNo: string | null;
  status: string;
  cost: string | null;
  desi: string | null;
  isDangerousGoods: boolean;
  deliveredAt: string | null;
  carrier: { code: string; name: string };
  order: { number: string } | null;
  events: { status: string; location: string | null; message: string | null; occurredAt: string }[];
}

export default async function ShipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("shipping");
  const format = await getFormatter();
  const me = await getMe();
  let s: Shipment;
  try {
    s = await apiGet<Shipment>(`/shipping/shipments/${encodeURIComponent(id)}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }
  const when = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "short", timeStyle: "short" });

  return (
    <>
      <Topbar
        heading={s.trackingNo ?? t("title")}
        sub={`${s.carrier.name}${s.order ? ` · ${s.order.number}` : ""}`}
        action={<ShipStatusPill status={s.status} />}
      />
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-8">
        <Link href="/kargo" className="self-start text-[13px] font-semibold">
          ← {t("back")}
        </Link>

        <TrackButton id={s.id} hasTracking={!!s.trackingNo} canEdit={me.permissions.includes("shipping:EDIT")} />

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
          <section className="flex flex-col gap-2 rounded-[16px] border border-line bg-surface p-5">
            <h2 className="m-0 font-display text-[17px] font-semibold">{t("section.events")}</h2>
            {s.events.length === 0 ? (
              <p className="m-0 text-[13px] text-muted">{t("noEvents")}</p>
            ) : (
              <ol className="m-0 flex list-none flex-col gap-2 p-0 text-[13px]">
                {s.events.map((e, i) => (
                  <li key={i} className="flex items-center gap-3 border-t border-line-soft py-2 first:border-t-0">
                    <span className="num w-28 shrink-0 text-muted">{when(e.occurredAt)}</span>
                    <ShipStatusPill status={e.status} />
                    <span className="text-text-2">
                      {e.location ?? ""} {e.message ?? ""}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section className="flex flex-col gap-1 self-start rounded-[16px] border border-line bg-surface p-5 text-[13px]">
            <div className="flex justify-between py-1">
              <span className="text-muted">{t("col.cost")}</span>
              <span className="num font-semibold">{s.cost ? fmtMoney(s.cost) : "—"}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-muted">Desi</span>
              <span className="num">{s.desi ?? "—"}</span>
            </div>
            {s.isDangerousGoods && <span className="mt-1 rounded-[8px] bg-warn-bg px-2 py-1 text-xs text-warn">UN1266</span>}
          </section>
        </div>
      </div>
    </>
  );
}
