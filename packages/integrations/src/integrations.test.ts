import { describe, expect, it } from "vitest";
import {
  backoffDelay,
  buildContext,
  classifyHttpError,
  createDefaultRegistry,
  DEFAULT_RETRY,
  IntegrationError,
  invoke,
  MemoryLogSink,
  resolveCredentials,
  TemplateMockAdapter,
  TokenBucket,
} from "./index.js";

const ctxWith = (sink: MemoryLogSink, credentials: Record<string, string> = {}) =>
  buildContext({ integrationId: "int_1", credentials, sink });

describe("kayıt defteri", () => {
  it("anahtar yoksa sahte adaptör döner", () => {
    const { mode, adapter } = createDefaultRegistry().resolve("TEMPLATE", { credentials: {} });
    expect(mode).toBe("mock");
    expect(adapter).toBeInstanceOf(TemplateMockAdapter);
  });
  it("anahtar varsa gerçek adaptör, zorlanırsa sahte", () => {
    const reg = createDefaultRegistry();
    expect(reg.resolve("TEMPLATE", { credentials: { apiKey: "x" } }).mode).toBe("live");
    expect(reg.resolve("TEMPLATE", { credentials: { apiKey: "x" } }, "mock").mode).toBe("mock");
  });
  it("sosyal, embeddings ve ek pazaryeri/kargo adaptörleri çözülür (F4-07/09, F5-09)", () => {
    const reg = createDefaultRegistry();
    for (const code of ["META", "TIKTOK", "AMAZON_TR", "CICEKSEPETI", "CARGO_MNG", "EMBEDDINGS"]) {
      expect(reg.resolve(code, { credentials: {} }, "mock").mode).toBe("mock");
    }
  });
  it("embeddings mock deterministik vektör üretir (F5-09)", async () => {
    const { adapter } = createDefaultRegistry().resolve<import("./adapter.js").IntegrationAdapter & import("./adapter.js").EmbeddingsCapabilities>("EMBEDDINGS", { credentials: {} }, "mock");
    const sink = new MemoryLogSink();
    const v1 = await adapter.embed(ctxWith(sink), "amber woody");
    const v2 = await adapter.embed(ctxWith(sink), "amber woody");
    expect(v1).toEqual(v2);
    expect(v1).toHaveLength(16);
  });
  it("bilinmeyen kod ve çift kayıt hata verir", () => {
    const reg = createDefaultRegistry();
    expect(() => reg.resolve("YOK", { credentials: {} })).toThrow();
    expect(() =>
      reg.register({
        code: "TEMPLATE",
        kind: "AI",
        requiredCredentials: [],
        create: () => new TemplateMockAdapter(),
        createMock: () => new TemplateMockAdapter(),
      }),
    ).toThrow();
  });
});

describe("invoke", () => {
  it("geçici hatada yeniden dener ve her denemeyi loglar", async () => {
    const sink = new MemoryLogSink();
    const adapter = new TemplateMockAdapter(2);
    await expect(adapter.healthCheck(ctxWith(sink))).resolves.toMatchObject({ ok: true });
    expect(adapter.calls).toBe(3);
    expect(sink.entries.map((e) => e.status)).toEqual(["RETRY", "RETRY", "OK"]);
    expect(sink.entries.every((e) => e.integrationId === "int_1" && e.operation === "health.check")).toBe(
      true,
    );
  });

  it("en fazla 6 deneme, sonra ERROR", async () => {
    const sink = new MemoryLogSink();
    const adapter = new TemplateMockAdapter(10);
    await expect(adapter.healthCheck(ctxWith(sink))).rejects.toBeInstanceOf(IntegrationError);
    expect(adapter.calls).toBe(DEFAULT_RETRY.maxAttempts);
    expect(sink.entries.at(-1)!.status).toBe("ERROR");
  });

  it("kalıcı hata yeniden denenmez", async () => {
    const sink = new MemoryLogSink();
    let calls = 0;
    await expect(
      invoke(ctxWith(sink), "listing.upsert", async () => {
        calls++;
        throw new IntegrationError("kategori eşlemesi eksik", false);
      }),
    ).rejects.toThrow("kategori eşlemesi eksik");
    expect(calls).toBe(1);
    expect(sink.entries).toHaveLength(1);
  });

  it("log'a giden istek ve yanıt maskelenir", async () => {
    const sink = new MemoryLogSink();
    await invoke(
      ctxWith(sink, { apiKey: "gizli-anahtar" }),
      "order.push",
      async () => ({ customer: { phone: "05321234512" } }),
      {
        request: { apiKey: "gizli-anahtar", buyer: { email: "ayse@example.com", tckn: "12345678901" } },
      },
    );
    const text = JSON.stringify(sink.entries);
    expect(text).not.toContain("gizli-anahtar");
    expect(text).not.toContain("05321234512");
    expect(text).not.toContain("12345678901");
    expect(text).not.toContain("ayse@example.com");
  });

  it("geri çekilme süresi üstel ve sınırlı", () => {
    const max = () => 0.999999;
    expect(backoffDelay(1, DEFAULT_RETRY, max)).toBeLessThan(500);
    expect(backoffDelay(3, DEFAULT_RETRY, max)).toBeLessThan(2000);
    expect(backoffDelay(3, DEFAULT_RETRY, max)).toBeGreaterThan(1000);
    expect(backoffDelay(20, DEFAULT_RETRY, max)).toBeLessThan(60_000);
  });

  it("HTTP hata sınıflandırması", () => {
    expect(classifyHttpError(429, "").retryable).toBe(true);
    expect(classifyHttpError(503, "").retryable).toBe(true);
    expect(classifyHttpError(400, "").retryable).toBe(false);
    expect(classifyHttpError(401, "").retryable).toBe(false);
  });
});

describe("token bucket", () => {
  it("kapasite kadar hemen verir, sonra dolum hızında", () => {
    let t = 0;
    const b = new TokenBucket(2, 1, () => t);
    expect(b.tryTake()).toBe(true);
    expect(b.tryTake()).toBe(true);
    expect(b.tryTake()).toBe(false);
    t = 1000;
    expect(b.tryTake()).toBe(true);
    expect(b.tryTake()).toBe(false);
  });
});

describe("kimlik bilgisi çözümleme", () => {
  it("env: referansını alan adlarına çevirir", () => {
    const env = { INTEGRATION_TRENDYOL_API_KEY: "k", INTEGRATION_TRENDYOL_SUPPLIER_ID: "42", OTHER: "x" };
    expect(resolveCredentials("env:TRENDYOL", env)).toEqual({ apiKey: "k", supplierId: "42" });
    expect(resolveCredentials(null, env)).toEqual({});
    expect(() => resolveCredentials("vault:x", env)).toThrow();
  });
});
