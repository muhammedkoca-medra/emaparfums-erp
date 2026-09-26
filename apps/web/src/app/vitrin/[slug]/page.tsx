import { type ShowcaseProduct } from "@atelier/shared";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ApiError, apiPublicGet } from "@/lib/api-server";
import { accordColor } from "../accords";

export const dynamic = "force-dynamic";

const SEASONS = ["winter", "spring", "summer", "autumn"] as const;

/** Vitrin ürün detayı (herkese açık): kart görseli + tam koku profili, gündüz/gece, mevsim. */
export default async function VitrinDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await getTranslations("vitrin");
  let p: ShowcaseProduct;
  try {
    p = await apiPublicGet<ShowcaseProduct>(`/showcase/products/${encodeURIComponent(slug)}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/vitrin" className="self-start text-[13px] font-semibold text-muted hover:text-text">
        ← {t("back")}
      </Link>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Kart görseli */}
        <div className="hero-title relative aspect-square overflow-hidden rounded-[22px] border border-line bg-surface-soft shadow-xl">
          {p.imageUrl ? (
            <Image src={p.imageUrl} alt={p.name} fill sizes="(max-width: 1024px) 100vw, 50vw" priority className="object-contain p-2" />
          ) : (
            <div className="flex h-full items-center justify-center font-display text-[28px] text-muted">{p.name}</div>
          )}
        </div>

        <div className="flex flex-col gap-5">
          <header className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="m-0 font-display text-[30px] leading-tight font-semibold sm:text-[38px]">{p.name}</h1>
              <span className="rounded-full bg-neu-bg px-2.5 py-0.5 text-[11px] font-semibold text-neu">{t(`gender.${p.gender}`)}</span>
            </div>
            <span className="text-[13px] text-muted">{t("concVol", { conc: p.concentration, vol: p.volumeMl })}</span>
          </header>

          <section className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-5">
            <h2 className="m-0 font-display text-[18px] font-semibold">{t("notes")}</h2>
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {p.accords.map((a) => (
                <li key={a.label} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-[13px] font-medium capitalize sm:w-32">{a.label}</span>
                  <span className="h-3 flex-1 overflow-hidden rounded-full bg-surface-soft">
                    <span className="block h-full rounded-full" style={{ width: `${a.strength}%`, background: accordColor(a.label) }} />
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-col gap-2 rounded-[18px] border border-line bg-surface p-5">
            <h2 className="m-0 font-display text-[16px] font-semibold">{t("dayNight")}</h2>
            <div className="flex h-8 overflow-hidden rounded-full border border-line-soft text-[11px] font-semibold">
              <span className="flex items-center justify-center bg-gold text-ink" style={{ width: `${p.dayPct}%` }}>
                {p.dayPct >= 20 ? t("day") : ""}
              </span>
              <span className="flex flex-1 items-center justify-center bg-ink text-on-ink">
                {100 - p.dayPct >= 20 ? t("night") : ""}
              </span>
            </div>
          </section>

          <section className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-5">
            <h2 className="m-0 font-display text-[16px] font-semibold">{t("seasons")}</h2>
            <dl className="m-0 grid grid-cols-2 gap-3">
              {SEASONS.map((s) => (
                <div key={s} className="flex flex-col gap-1">
                  <dt className="text-[12px] text-text-2">{t(`season.${s}`)}</dt>
                  <dd className="m-0">
                    <span className="block h-2 overflow-hidden rounded-full bg-surface-soft">
                      <span className="block h-full rounded-full bg-gold" style={{ width: `${p.seasons[s]}%` }} />
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="m-0 text-[11px] text-muted">{t("seasonNote")}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
