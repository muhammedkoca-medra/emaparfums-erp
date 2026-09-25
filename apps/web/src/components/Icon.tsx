import { ICONS } from "@/lib/modules";

/** Çizgi (stroke) SVG ikon; dekoratif, ekran okuyucudan gizli (docs/06 §İlkeler). */
export function Icon({ name, size = 18 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" fill="none" aria-hidden="true">
      <rect x="12" y="3" width="10" height="5" rx="1.5" stroke="#E4C89A" strokeWidth="1.6" />
      <rect x="14.5" y="8" width="5" height="4" stroke="#E4C89A" strokeWidth="1.6" />
      <rect x="6" y="12" width="22" height="19" rx="5" stroke="#E4C89A" strokeWidth="1.6" />
      <path d="M11 22c2-3 4-3 6 0s4 3 6 0" stroke="#E4C89A" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
