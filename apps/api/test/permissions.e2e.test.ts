import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import { ModulesContainer } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACCESS_KEY, type AccessRule } from "../src/permissions/decorators.js";
import { createUser, loginAgent, setupTestApp, type TestContext } from "./helpers.js";

let ctx: TestContext;
beforeAll(async () => {
  ctx = await setupTestApp();
});
afterAll(async () => {
  await ctx.app.close();
});

/** Uygulamadaki tüm HTTP uçlarını ve erişim kurallarını listeler. */
function allRoutes(): { route: string; rule: AccessRule | undefined }[] {
  const out: { route: string; rule: AccessRule | undefined }[] = [];
  for (const mod of ctx.app.get(ModulesContainer).values()) {
    for (const wrapper of mod.controllers.values()) {
      const cls = wrapper.metatype as (new (...a: unknown[]) => unknown) | null;
      if (!cls) continue;
      const base = Reflect.getMetadata(PATH_METADATA, cls) as string;
      const classRule = Reflect.getMetadata(ACCESS_KEY, cls) as AccessRule | undefined;
      for (const name of Object.getOwnPropertyNames(cls.prototype)) {
        const handler = (cls.prototype as Record<string, unknown>)[name];
        if (typeof handler !== "function" || name === "constructor") continue;
        const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        if (path === undefined) continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as number;
        out.push({
          route: `${method} /${base}/${path}`.replace(/\/+/g, "/"),
          rule: (Reflect.getMetadata(ACCESS_KEY, handler) as AccessRule | undefined) ?? classRule,
        });
      }
    }
  }
  return out;
}

describe("yetki (F0-05, YTK-01)", () => {
  it("izinsiz uç yok: her uçta Public, Authenticated veya RequirePermission var", () => {
    const routes = allRoutes();
    expect(routes.length).toBeGreaterThan(5);
    const missing = routes.filter((r) => !r.rule).map((r) => r.route);
    expect(missing).toEqual([]);
  });

  it("herkese açık uçlar yalnızca beklenenler", () => {
    const pub = allRoutes()
      .filter((r) => r.rule?.kind === "public")
      .map((r) => r.route)
      .sort();
    // RequestMethod: GET = 0, POST = 1. Vitrin uçları herkese açıktır (yalnızca güvenli
    // koku profili döner; referans marka/iç veri sızmaz — bkz. showcase.e2e.test.ts).
    // Ödeme webhook'u herkese açıktır ama imza doğrulanır (ODM-04 · payments.e2e.test.ts).
    expect(pub).toEqual([
      "0 /showcase/products",
      "0 /showcase/products/:slug",
      "0 /system/health",
      "1 /auth/login",
      "1 /auth/mfa/verify",
      "1 /webhooks/cargo/:carrier",
      "1 /webhooks/einvoice",
      "1 /webhooks/payments/:provider",
    ]);
  });

  it("oturumsuz istek 401 ve Türkçe mesaj alır", async () => {
    const res = await ctx.http().get("/admin/users").expect(401);
    expect(res.body.message).toBe("Oturum açmanız gerekiyor");
  });

  it("geçersiz token 401 alır", async () => {
    await ctx.http().get("/auth/me").set("Authorization", "Bearer uydurma").expect(401);
  });

  it("izni olmayan kullanıcı 403 alır", async () => {
    const agent = await loginAgent(ctx, await createUser(ctx, ["WAREHOUSE"]));
    const res = await agent.get("/admin/users").expect(403);
    expect(res.body.message).toBe("Bu işlem için yetkiniz yok");
    await agent.post("/system/ping").expect(403);
  });

  it("yönetici erişir", async () => {
    const agent = await loginAgent(ctx, await createUser(ctx, ["ADMIN"]));
    await agent.get("/admin/users").expect(200);
    await agent.get("/admin/roles").expect(200);
  });

  it("/auth/me izinleri rollerin birleşimi olarak döner", async () => {
    const agent = await loginAgent(ctx, await createUser(ctx, ["WAREHOUSE", "QUALITY"]));
    const res = await agent.get("/auth/me").expect(200);
    expect(res.body.permissions).toContain("stock:EDIT");
    expect(res.body.permissions).toContain("quality:APPROVE");
    expect(res.body.permissions).not.toContain("admin:VIEW");
    expect(res.body.roles.map((r: { code: string }) => r.code).sort()).toEqual(["QUALITY", "WAREHOUSE"]);
  });
});
