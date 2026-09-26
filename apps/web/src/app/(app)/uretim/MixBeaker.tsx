import { useTranslations } from "next-intl";

/**
 * Karışım görseli: beher içinde parfüm bazı (alt) + esans (üst, altın) katmanları,
 * gramaja orantılı yükseklikte. Tüp/beher metaforu (docs/06 görsellik).
 */
export function MixBeaker({
  essenceGr,
  baseGr,
  essencePct,
  basePct,
}: {
  essenceGr: string | null;
  baseGr: string | null;
  essencePct: number | null;
  basePct: number | null;
}) {
  const t = useTranslations("production.mix");
  const e = Number(essenceGr ?? 0);
  const b = Number(baseGr ?? 0);
  const total = e + b;
  // Beher iç yüksekliği 150 (y 40→190). Sıvı toplam %85 dolu.
  const fillH = 150 * 0.85;
  const baseH = total > 0 ? (b / total) * fillH : 0;
  const essH = total > 0 ? (e / total) * fillH : 0;
  const baseY = 190 - baseH;
  const essY = baseY - essH;

  return (
    <div className="flex flex-col items-center gap-3 rounded-[18px] border border-line bg-surface p-5">
      <h3 className="m-0 self-start font-display text-[16px] font-semibold">{t("title")}</h3>
      <svg viewBox="0 0 160 210" className="h-52 w-auto" role="img" aria-label={t("title")}>
        <defs>
          <linearGradient id="ess" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f0d9a8" />
            <stop offset="100%" stopColor="#d9a94a" />
          </linearGradient>
          <linearGradient id="base" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#efe7d6" />
            <stop offset="100%" stopColor="#cdbf9f" />
          </linearGradient>
          <clipPath id="beaker">
            <path d="M46 40 h68 v112 a34 34 0 0 1 -34 38 a34 34 0 0 1 -34 -38 z" />
          </clipPath>
        </defs>
        {/* sıvılar */}
        <g clipPath="url(#beaker)">
          <rect x="40" y={baseY} width="80" height={baseH + 40} fill="url(#base)" />
          <rect x="40" y={essY} width="80" height={essH} fill="url(#ess)" />
          {/* katman çizgisi */}
          {total > 0 && <line x1="40" y1={baseY} x2="120" y2={baseY} stroke="#ffffff" strokeOpacity="0.5" strokeWidth="1.5" />}
          {/* kabarcıklar */}
          <circle cx="66" cy={baseY + 24} r="3" fill="#ffffff" fillOpacity="0.35" />
          <circle cx="90" cy={baseY + 40} r="2.2" fill="#ffffff" fillOpacity="0.3" />
          <circle cx="78" cy={essY + 12} r="2.5" fill="#ffffff" fillOpacity="0.4" />
        </g>
        {/* beher camı */}
        <path
          d="M46 40 h68 v112 a34 34 0 0 1 -34 38 a34 34 0 0 1 -34 -38 z"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.55"
          strokeWidth="2.5"
          className="text-ink-line"
        />
        {/* ağız */}
        <path d="M42 40 h76" stroke="currentColor" strokeOpacity="0.6" strokeWidth="3" strokeLinecap="round" className="text-ink-line" />
        {/* ölçü çizgileri */}
        {[70, 100, 130].map((y) => (
          <line key={y} x1="106" y1={y} x2="114" y2={y} stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" className="text-ink-line" />
        ))}
      </svg>
      <dl className="m-0 grid w-full grid-cols-2 gap-2 text-center text-[13px]">
        <div className="flex flex-col gap-0.5 rounded-[10px] bg-surface-soft px-2 py-2">
          <dt className="flex items-center justify-center gap-1.5 text-[11px] text-muted">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#d9a94a" }} /> {t("essence")}
          </dt>
          <dd className="num m-0 font-semibold">
            {essenceGr ?? "—"} {t("gram")} {essencePct != null && <span className="text-muted">· %{essencePct}</span>}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5 rounded-[10px] bg-surface-soft px-2 py-2">
          <dt className="flex items-center justify-center gap-1.5 text-[11px] text-muted">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#cdbf9f" }} /> {t("base")}
          </dt>
          <dd className="num m-0 font-semibold">
            {baseGr ?? "—"} {t("gram")} {basePct != null && <span className="text-muted">· %{basePct}</span>}
          </dd>
        </div>
      </dl>
      {total > 0 && (
        <p className="num m-0 text-[12px] text-muted">
          {t("total")}: {total.toLocaleString("tr-TR")} {t("gram")}
        </p>
      )}
    </div>
  );
}
