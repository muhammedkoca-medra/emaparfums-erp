import { LOGO_PATHS } from "./brand-logo-paths";

/**
 * EMA Parfums logosu (kaynak: docs/marka/ema-parfums-logo.pdf). Tek renkli vektör; renk
 * `currentColor` ile bulunduğu yerden alınır (koyu zeminde altın, açık zeminde mürekkep).
 * Kesimler aynı çizimin farklı bölgeleridir (PDF nokta birimi, 170 × 227).
 */
const VIEWBOX = {
  /** Motif + EMA + PARFUMS + ayraç + "Koku Bir İmzadır" */
  full: "0 0 170.079 226.772",
  /** Motif + EMA + PARFUMS */
  compact: "0 6 170.079 155",
  /** Yalnızca çiçek motifi */
  mark: "54 6 62 57",
  /** Yalnızca EMA PARFUMS yazısı */
  wordmark: "0 72 170.079 90",
} as const;

export type BrandLogoVariant = keyof typeof VIEWBOX;

export function BrandLogo({
  variant = "full",
  title,
  className,
  height,
}: {
  variant?: BrandLogoVariant;
  /** Erişilebilir ad; verilmezse dekoratif sayılır. */
  title?: string;
  className?: string;
  height?: number;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={VIEWBOX[variant]}
      height={height}
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      // Statik, depo içindeki logodan üretilmiş işaretleme (kullanıcı girdisi değil)
      dangerouslySetInnerHTML={{ __html: LOGO_PATHS }}
    />
  );
}
