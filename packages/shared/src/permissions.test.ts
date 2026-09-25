import { describe, expect, it } from "vitest";
import { defaultRolePermissions, PERMISSION_MODULES, ROLE_CODES } from "./permissions.js";

describe("varsayılan yetki matrisi", () => {
  const m = defaultRolePermissions();
  const has = (role: (typeof ROLE_CODES)[number], module: string, action: string) =>
    m[role].some((p) => p.module === module && p.action === action);

  it("yönetici tüm modülleri görür", () => {
    for (const mod of PERMISSION_MODULES) expect(has("ADMIN", mod, "VIEW")).toBe(true);
  });
  it("yetki.md örnekleri", () => {
    expect(has("PURCHASING", "purchasing", "APPROVE")).toBe(true);
    expect(has("PURCHASING", "purchasing", "DELETE")).toBe(false);
    expect(has("WAREHOUSE", "receiving", "CREATE")).toBe(true);
    expect(has("WAREHOUSE", "purchasing", "CREATE")).toBe(false);
    expect(has("ACCOUNTANT_EXT", "tax", "APPROVE")).toBe(true);
    expect(has("ACCOUNTANT_EXT", "tax", "EDIT")).toBe(false);
    expect(has("MARKETING", "social", "APPROVE")).toBe(true);
    expect(has("PURCHASING", "customer_pii", "VIEW")).toBe(false);
    expect(has("ADMIN", "tax", "DELETE")).toBe(false);
  });
  it("mali müşavir salt okunur (tax onayı hariç)", () => {
    const writes = m.ACCOUNTANT_EXT.filter((p) => p.action !== "VIEW");
    expect(writes).toEqual([{ module: "tax", action: "APPROVE" }]);
  });
  it("tekrarlanan izin yok", () => {
    for (const role of ROLE_CODES) {
      const keys = m[role].map((p) => `${p.module}:${p.action}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
