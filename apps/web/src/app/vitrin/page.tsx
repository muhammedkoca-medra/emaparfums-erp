import { type ShowcaseProduct } from "@atelier/shared";
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { apiPublicGet } from "@/lib/api-server";
import { accordColor } from "./accords";
import { BottleViewer } from "@/components/BottleViewer";
import { HeroCarousel } from "./HeroCarousel";

export const dynamic = "force-dynamic";

const GENDERS = ["women", "men", "unisex"] as const;

/** Vitrin (herkese açık): hero geçiş karuseli + görselli koku kartları ızgarası. */
export default async function VitrinPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const t = await getTranslations("vitrin");
  const { c } = await searchParams;
  const gender = GENDERS.find((g) => g === c);
  const all = await apiPublicGet<ShowcaseProduct[]>("/showcase/products").catch(() => []);
  const products = gender ? all.filter((p) => p.gender === gender) : all;

  // Hero: her cinsiyetten örnekler + görseli olanlar (en fazla 6).
  const withImg = all.filter((p) => p.imageUrl);
  const featured = [
    ...withImg.filter((p) => p.gender === "women").slice(0, 2),
    ...withImg.filter((p) => p.gender === "men").slice(0, 2),
    ...withImg.filter((p) => p.gender === "unisex").slice(0, 2),
  ];
  const heroSlides = (featured.length ? featured : withImg.slice(0, 6)).map((p) => ({
    slug: p.slug,
    name: p.name,
    gender: p.gender,
    imageUrl: p.imageUrl,
    accords: p.accords,
  }));

  const chip = (key: string, href: string, active: boolean) => (
    <Link
      key={key}
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex min-h-9 items-center rounded-full border px-4 text-[13px] font-semibold no-underline transition-colors ${
        active ? "border-ink bg-ink text-on-ink" : "border-line bg-surface text-text-2 hover:border-gold-2"
      }`}
    >
      {key === "all" ? t("filterAll") : t(`gender.${key}`)}
    </Link>
  );

  return (
    <div className="flex flex-col gap-8">
      {heroSlides.length > 0 && <HeroCarousel slides={heroSlides} />}

      {/* EMA şişesi — interaktif 3B */}
      <section className="grid items-center gap-6 overflow-hidden rounded-[24px] border border-line bg-ink p-6 text-on-ink sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="flex flex-col gap-3">
          <span className="text-[11px] font-bold tracking-[0.18em] text-gold uppercase">{t("bottleTitle")}</span>
          <h2 className="m-0 font-display text-[30px] leading-tight font-semibold sm:text-[40px]">{t("bottleSlogan")}</h2>
          <p className="m-0 max-w-md text-[14px] leading-relaxed text-on-ink-2">{t("bottleDesc")}</p>
        </div>
        <BottleViewer className="mx-auto aspect-[4/5] w-full max-w-[360px] cursor-grab active:cursor-grabbing" />
      </section>

      <section className="flex flex-col gap-2">
        <span className="text-[11px] font-bold tracking-[0.14em] text-gold-text uppercase">{t("tagline")}</span>
        <h1 className="m-0 font-display text-[28px] leading-tight font-semibold sm:text-[34px]">{t("title")}</h1>
        <p className="m-0 max-w-2xl text-[14px] leading-relaxed text-text-2">{t("intro")}</p>
      </section>

      <div className="sticky top-[60px] z-[5] -mx-4 flex flex-wrap items-center gap-2 border-b border-line bg-ground/85 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8">
        {chip("all", "/vitrin", !gender)}
        {GENDERS.map((g) => chip(g, `/vitrin?c=${g}`, gender === g))}
        <span className="ml-auto text-xs text-muted">{t("count", { count: products.length })}</span>
      </div>

      {products.length === 0 ? (
        <p className="text-[13px] text-muted">{t("empty")}</p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-1 gap-5 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p, idx) => (
            <li key={p.id} className="vitrin-card" style={{ animationDelay: `${Math.min(idx, 8) * 40}ms` }}>
              <Link
                href={`/vitrin/${p.slug}`}
                className="group flex h-full flex-col overflow-hidden rounded-[18px] border border-line bg-surface no-underline shadow-sm transition-all hover:-translate-y-1 hover:border-gold-2 hover:shadow-xl"
              >
                <div className="relative aspect-square overflow-hidden bg-surface-soft">
                  {p.imageUrl ? (
                    <Image
                      src={p.imageUrl}
                      alt={p.name}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-contain"
                      loading={idx < 6 ? "eager" : "lazy"}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center font-display text-[22px] text-muted">{p.name}</div>
                  )}
                  <span className="absolute top-3 right-3 rounded-full bg-ink/80 px-2.5 py-0.5 text-[10.5px] font-semibold text-on-ink backdrop-blur">
                    {t(`gender.${p.gender}`)}
                  </span>
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-ink/85 to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    <span className="text-[13px] font-semibold text-on-ink">{t("detail")} →</span>
                    <span className="flex gap-1">
                      {p.accords.slice(0, 4).map((a) => (
                        <span key={a.label} className="h-2.5 w-2.5 rounded-full ring-1 ring-on-ink/40" style={{ background: accordColor(a.label) }} />
                      ))}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 px-4 py-3">
                  <span className="truncate font-display text-[16px] font-semibold text-text">{p.name}</span>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted">{t("concVol", { conc: p.concentration, vol: p.volumeMl })}</span>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold ${
                        p.inStock ? "bg-ok-bg text-ok" : "bg-surface-soft text-muted"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${p.inStock ? "bg-ok" : "bg-muted"}`} />
                      {t(p.inStock ? "inStock" : "outStock")}
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
