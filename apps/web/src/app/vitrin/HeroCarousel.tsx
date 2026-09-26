"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

interface Slide {
  slug: string;
  name: string;
  gender: string;
  imageUrl: string | null;
  accords: { label: string; strength: number }[];
}

const INTERVAL = 5000;

/** Üst düzey vitrin hero: kart görselleri arasında yumuşak geçiş (crossfade + Ken Burns), otomatik ilerler. */
export function HeroCarousel({ slides }: { slides: Slide[] }) {
  const t = useTranslations("vitrin");
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const n = slides.length;

  const go = useCallback((next: number) => setI(((next % n) + n) % n), [n]);

  useEffect(() => {
    if (paused || n <= 1) return;
    timer.current = setInterval(() => setI((p) => (p + 1) % n), INTERVAL);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [paused, n]);

  if (n === 0) return null;
  const active = slides[i]!;

  return (
    <section
      className="relative overflow-hidden rounded-[24px] border border-line bg-ink text-on-ink"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label={t("title")}
    >
      {/* Arka plan: aktif görselin bulanık, koyu büyütülmüş hali */}
      {active.imageUrl && (
        <div key={`bg-${active.slug}`} className="hero-bg absolute inset-0" style={{ backgroundImage: `url(${active.imageUrl})` }} aria-hidden />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/75 to-ink/40" aria-hidden />

      <div className="relative grid items-center gap-6 p-6 sm:p-10 lg:grid-cols-[1fr_minmax(320px,420px)]">
        <div className="flex flex-col gap-4 order-2 lg:order-1">
          <span className="text-[11px] font-bold tracking-[0.18em] text-gold uppercase">{t("tagline")}</span>
          <Link href={`/vitrin/${active.slug}`} className="group no-underline text-on-ink hover:text-on-ink">
            <h2 className="hero-title m-0 font-display text-[34px] leading-tight font-semibold sm:text-[46px]">{active.name}</h2>
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-on-ink/25 px-2.5 py-0.5 text-[11px] font-semibold">{t(`gender.${active.gender}`)}</span>
            {active.accords.slice(0, 3).map((a) => (
              <span key={a.label} className="rounded-full bg-on-ink/10 px-2.5 py-0.5 text-[11px] font-medium capitalize">
                {a.label}
              </span>
            ))}
          </div>
          <Link
            href={`/vitrin/${active.slug}`}
            className="mt-1 inline-flex w-fit items-center gap-2 rounded-full bg-gold px-5 py-2.5 text-[13px] font-bold text-ink no-underline transition-transform hover:scale-[1.03]"
          >
            {t("detail")} →
          </Link>
        </div>

        <div className="order-1 lg:order-2">
          <div className="relative mx-auto aspect-square w-full max-w-[420px] overflow-hidden rounded-[18px] shadow-2xl ring-1 ring-on-ink/15">
            {slides.map((s, idx) =>
              s.imageUrl ? (
                <Image
                  key={s.slug}
                  src={s.imageUrl}
                  alt={s.name}
                  fill
                  sizes="(max-width: 1024px) 90vw, 420px"
                  priority={idx === 0}
                  className={`hero-img object-cover transition-opacity duration-700 ease-out ${idx === i ? "opacity-100" : "opacity-0"}`}
                />
              ) : null,
            )}
          </div>
        </div>
      </div>

      {/* Kontroller */}
      <div className="relative flex items-center justify-center gap-2 pb-5">
        {slides.map((s, idx) => (
          <button
            key={s.slug}
            type="button"
            onClick={() => go(idx)}
            aria-label={`${idx + 1}. ${s.name}`}
            aria-current={idx === i ? "true" : undefined}
            className={`h-1.5 rounded-full transition-all ${idx === i ? "w-6 bg-gold" : "w-1.5 bg-on-ink/30 hover:bg-on-ink/50"}`}
          />
        ))}
      </div>
    </section>
  );
}
