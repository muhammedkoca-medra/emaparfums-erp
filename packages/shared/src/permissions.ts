/**
 * İzin kataloğu ve varsayılan yetki matrisi.
 * Kaynak: docs/03-moduller/yetki.md §Varsayılan yetki matrisi. Tablo değişirse burası da değişir.
 * Tohum verisi (RolePermission) ve API'deki @RequirePermission bu listeyi kullanır.
 */

export const PERMISSION_MODULES = [
  "dashboard",
  "production",
  "stock",
  "receiving",
  "purchasing",
  "quality",
  "sales",
  "ecommerce",
  "invoicing",
  "tax",
  "costing",
  "payments",
  "shipping",
  "loyalty",
  "social",
  "content",
  "scent",
  "admin",
  "customer_pii",
] as const;
export type PermissionModule = (typeof PERMISSION_MODULES)[number];

export const PERMISSION_ACTIONS = ["VIEW", "CREATE", "EDIT", "APPROVE", "DELETE"] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export const ROLE_CODES = [
  "ADMIN",
  "PRODUCTION",
  "QUALITY",
  "WAREHOUSE",
  "PURCHASING",
  "SALES",
  "MARKETING",
  "ACCOUNTING",
  "ACCOUNTANT_EXT",
] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

/** Arayüzde görünen rol adları (docs/00-genel-bakis.md §Kullanıcılar ve roller). */
export const ROLE_NAMES: Record<RoleCode, string> = {
  ADMIN: "Yönetici",
  PRODUCTION: "Üretim & Ar-Ge",
  QUALITY: "Kalite",
  WAREHOUSE: "Depo",
  PURCHASING: "Satın alma",
  SALES: "Satış & e-ticaret",
  MARKETING: "Pazarlama",
  ACCOUNTING: "Muhasebe",
  ACCOUNTANT_EXT: "Mali müşavir",
};

/** Kısaltma → eylem: G, O, D, On, S */
const ACTION_BY_CODE = { G: "VIEW", O: "CREATE", D: "EDIT", On: "APPROVE", S: "DELETE" } as const;
type ActionCode = keyof typeof ACTION_BY_CODE;

function parse(spec: string): PermissionAction[] {
  const out: PermissionAction[] = [];
  const re = /On|G|O|D|S/g;
  for (const m of spec.matchAll(re)) out.push(ACTION_BY_CODE[m[0] as ActionCode]);
  return out;
}

type Matrix = Partial<Record<PermissionModule, string>>;

/**
 * yetki.md tablosunun birebir kodlanmış hali.
 * Notlar:
 *  - "dashboard": tabloda yok; kontrol paneli tüm iç kullanıcılara açıktır.
 *  - "receiving": tablodaki "Depo · purchasing: G (kabul O)" hücresi. Mal kabul ayrı izin koduyla
 *    ayrıldı ki depo satın alma siparişi oluşturamasın.
 *  - "social / content": tek satır, iki izin koduna bölündü.
 *  - Tutar limitleri (ör. satın alma onayı ≤ ₺50.000) ApprovalRule tablosundadır.
 */
const MATRIX: Record<RoleCode, Matrix> = {
  ADMIN: {
    dashboard: "G",
    production: "GODOnS",
    stock: "GODOnS",
    receiving: "GODOnS",
    purchasing: "GODOnS",
    quality: "GODOnS",
    sales: "GODOnS",
    ecommerce: "GODOnS",
    invoicing: "GODOnS",
    tax: "GODOn",
    costing: "GODOn",
    payments: "GODOnS",
    shipping: "GODOnS",
    loyalty: "GODOnS",
    social: "GODOnS",
    content: "GODOnS",
    scent: "GODOnS",
    admin: "GODOnS",
    customer_pii: "G",
  },
  PRODUCTION: {
    dashboard: "G",
    production: "GODOn",
    stock: "G",
    receiving: "G",
    purchasing: "G",
    quality: "G",
    costing: "G",
    scent: "GOD",
  },
  QUALITY: {
    dashboard: "G",
    production: "G",
    stock: "G",
    receiving: "G",
    purchasing: "G",
    quality: "GODOn",
    scent: "G",
  },
  WAREHOUSE: {
    dashboard: "G",
    production: "G",
    stock: "GOD",
    receiving: "GO",
    purchasing: "G",
    quality: "G",
    sales: "G",
    shipping: "GOD",
  },
  PURCHASING: {
    dashboard: "G",
    production: "G",
    stock: "GO",
    receiving: "GO",
    purchasing: "GODOn",
    quality: "G",
    invoicing: "G",
    costing: "G",
  },
  SALES: {
    dashboard: "G",
    stock: "G",
    quality: "G",
    sales: "GOD",
    ecommerce: "GOD",
    invoicing: "G",
    payments: "G",
    shipping: "GOD",
    loyalty: "GOD",
    social: "G",
    content: "G",
    scent: "G",
    customer_pii: "G",
  },
  MARKETING: {
    dashboard: "G",
    quality: "G",
    sales: "G",
    ecommerce: "G",
    loyalty: "GOD",
    social: "GODOn",
    content: "GODOn",
    scent: "G",
  },
  ACCOUNTING: {
    dashboard: "G",
    production: "G",
    stock: "G",
    purchasing: "G",
    sales: "G",
    invoicing: "GODOn",
    tax: "GD",
    costing: "GOD",
    payments: "GOD",
    shipping: "G",
    loyalty: "G",
    customer_pii: "G",
  },
  ACCOUNTANT_EXT: {
    stock: "G",
    purchasing: "G",
    sales: "G",
    invoicing: "G",
    tax: "GOn",
    costing: "G",
    payments: "G",
  },
};

export type PermissionKey = `${PermissionModule}:${PermissionAction}`;

export const permissionKey = (module: PermissionModule, action: PermissionAction): PermissionKey =>
  `${module}:${action}`;

/** Varsayılan matris: rol → izin anahtarları. */
export function defaultRolePermissions(): Record<RoleCode, { module: PermissionModule; action: PermissionAction }[]> {
  const out = {} as Record<RoleCode, { module: PermissionModule; action: PermissionAction }[]>;
  for (const role of ROLE_CODES) {
    out[role] = Object.entries(MATRIX[role]).flatMap(([module, spec]) =>
      parse(spec).map((action) => ({ module: module as PermissionModule, action })),
    );
  }
  return out;
}

export const isPermissionModule = (v: string): v is PermissionModule =>
  (PERMISSION_MODULES as readonly string[]).includes(v);
