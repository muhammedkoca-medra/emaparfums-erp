import { type PermissionModule } from "@atelier/shared";

/**
 * Kenar menü tanımı (prototip "Kenar menü", docs/00-genel-bakis.md §Modüller).
 * Rota adları docs/03-moduller dosya adlarıyla aynıdır. Menü öğesi, kullanıcının ilgili modülde
 * VIEW izni yoksa gizlenir; asıl yetki kontrolü API'dedir (YTK-01).
 */
export type NavGroupKey = "general" | "operations" | "commerce" | "finance" | "marketing" | "management";

export interface NavItem {
  key: string; // messages: nav.modules.<key>
  href: string;
  permission: PermissionModule;
  icon: keyof typeof ICONS;
  /** Modülün geliştirileceği faz (docs/05-yol-haritasi.md). */
  phase: number;
  spec?: string;
}

export const ICONS = {
  dash: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z",
  map: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM5 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM19 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM5 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM19 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM6.5 6.5L10 10M17.5 6.5L14 10M6.5 17.5L10 14M17.5 17.5L14 14",
  flask: "M9 3h6M10 3v6L4.5 18.5A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-2.5L14 9V3M7 15h10",
  box: "M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8",
  cart: "M3 4h2l2.4 11h11.2L21 7H6.2M9 20h.01M18 20h.01",
  trend: "M3 17l6-6 4 4 8-8M15 7h6v6",
  store: "M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9h16M9 20v-6h6v6",
  card: "M3 6h18v12H3zM3 10h18M7 15h4",
  mega: "M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14",
  pen: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  doc: "M6 2h9l5 5v15H6zM14 2v6h6M9 13h8M9 17h6",
  truck: "M2 6h12v10H2zM14 9h4l3 3v4h-7M5 18a2 2 0 1 0 4 0 2 2 0 0 0-4 0zM15 18a2 2 0 1 0 4 0 2 2 0 0 0-4 0z",
  pct: "M19 5L5 19M7 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM17 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4",
  coin: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15 9h-4a1.5 1.5 0 0 0 0 3h2a1.5 1.5 0 0 1 0 3H9M12 7v2M12 15v2",
  heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
  key: "M8 14a4 4 0 1 1 0-8 4 4 0 0 1 0 8zM11 10h10M18 10v4M15 10v3",
  phone: "M7 2h10v20H7zM11 18h2",
  spark:
    "M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8zM19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z",
} as const;

export const NAV: { group: NavGroupKey; items: NavItem[] }[] = [
  {
    group: "general",
    items: [
      {
        key: "dashboard",
        href: "/",
        permission: "dashboard",
        icon: "dash",
        phase: 0,
        spec: "kontrol-paneli.md",
      },
      { key: "systemMap", href: "/sistem-haritasi", permission: "dashboard", icon: "map", phase: 1 },
    ],
  },
  {
    group: "operations",
    items: [
      {
        key: "production",
        href: "/uretim",
        permission: "production",
        icon: "flask",
        phase: 3,
        spec: "uretim.md",
      },
      { key: "stock", href: "/stok", permission: "stock", icon: "box", phase: 1, spec: "stok.md" },
      {
        key: "purchasing",
        href: "/satin-alma",
        permission: "purchasing",
        icon: "cart",
        phase: 2,
        spec: "satin-alma.md",
      },
      { key: "quality", href: "/kalite", permission: "quality", icon: "shield", phase: 3, spec: "kalite.md" },
    ],
  },
  {
    group: "commerce",
    items: [
      { key: "sales", href: "/satis", permission: "sales", icon: "trend", phase: 2, spec: "satis.md" },
      {
        key: "ecommerce",
        href: "/e-ticaret",
        permission: "ecommerce",
        icon: "store",
        phase: 2,
        spec: "e-ticaret.md",
      },
      {
        key: "loyalty",
        href: "/sadakat",
        permission: "loyalty",
        icon: "heart",
        phase: 5,
        spec: "sadakat.md",
      },
    ],
  },
  {
    group: "finance",
    items: [
      { key: "payments", href: "/odeme", permission: "payments", icon: "card", phase: 2, spec: "odeme.md" },
      {
        key: "invoicing",
        href: "/fatura",
        permission: "invoicing",
        icon: "doc",
        phase: 2,
        spec: "fatura.md",
      },
      { key: "tax", href: "/vergi", permission: "tax", icon: "pct", phase: 1, spec: "vergi.md" },
      { key: "costing", href: "/maliyet", permission: "costing", icon: "coin", phase: 4, spec: "maliyet.md" },
      { key: "shipping", href: "/kargo", permission: "shipping", icon: "truck", phase: 2, spec: "kargo.md" },
    ],
  },
  {
    group: "marketing",
    items: [
      {
        key: "social",
        href: "/sosyal-medya",
        permission: "social",
        icon: "mega",
        phase: 4,
        spec: "sosyal-medya.md",
      },
      {
        key: "content",
        href: "/icerik-studyosu",
        permission: "content",
        icon: "pen",
        phase: 4,
        spec: "icerik-studyosu.md",
      },
      { key: "scent", href: "/koku-ai", permission: "scent", icon: "spark", phase: 5, spec: "koku-ai.md" },
    ],
  },
  {
    group: "management",
    items: [
      { key: "admin", href: "/yetki", permission: "admin", icon: "key", phase: 1, spec: "yetki.md" },
      {
        key: "mobile",
        href: "/mobil-depo",
        permission: "stock",
        icon: "phone",
        phase: 3,
        spec: "mobil-depo.md",
      },
    ],
  },
];

export const ALL_ITEMS = NAV.flatMap((g) => g.items);

export const findBySlug = (slug: string) => ALL_ITEMS.find((i) => i.href === `/${slug}`);

export const canView = (permissions: readonly string[], module: PermissionModule) =>
  permissions.includes(`${module}:VIEW`);

/** Kullanıcının görebileceği gruplar (boş gruplar çıkarılır). */
export function visibleNav(permissions: readonly string[]) {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => canView(permissions, i.permission)) })).filter(
    (g) => g.items.length > 0,
  );
}
