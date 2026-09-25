import { SetMetadata } from "@nestjs/common";
import { type PermissionAction, type PermissionModule } from "@atelier/shared";

/**
 * Her uç tam olarak bir erişim sınıfı taşır (YTK-01). Hiçbirini taşımayan uç guard tarafından
 * reddedilir ve test/permissions.e2e.test.ts'deki "izinsiz uç" testi başarısız olur.
 */
export const ACCESS_KEY = "atelier:access";

export type AccessRule =
  | { kind: "public" }
  | { kind: "authenticated" }
  | { kind: "permission"; module: PermissionModule; action: PermissionAction };

/** Oturum gerektirmeyen uç (sağlık kontrolü, giriş). */
export const Public = () => SetMetadata(ACCESS_KEY, { kind: "public" } satisfies AccessRule);

/** Oturum açmış her kullanıcıya açık uç (kendi profilini görme, çıkış). */
export const Authenticated = () => SetMetadata(ACCESS_KEY, { kind: "authenticated" } satisfies AccessRule);

/** RolePermission tablosunda (module, action) izni olan kullanıcılara açık uç. */
export const RequirePermission = (module: PermissionModule, action: PermissionAction) =>
  SetMetadata(ACCESS_KEY, { kind: "permission", module, action } satisfies AccessRule);
