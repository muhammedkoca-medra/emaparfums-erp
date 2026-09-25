import { type IntegrationAdapter, type IntegrationContext, type IntegrationKind } from "./adapter.js";

/**
 * Adaptör kayıt defteri. Her entegrasyon gerçek ve sahte (mock) fabrikasıyla kaydolur.
 * Kimlik bilgisi yoksa veya INTEGRATIONS_MODE=mock ise sahte adaptör döner (docs/01 §İlkeler 3):
 * geliştirme ve testler dış sisteme bağımlı olmaz, gerçek API çağrısı yapılmaz.
 */
export interface AdapterDefinition<A extends IntegrationAdapter = IntegrationAdapter> {
  code: string;
  kind: IntegrationKind;
  /** Gerçek adaptör için zorunlu kimlik bilgisi anahtarları (ör. ["apiKey", "apiSecret"]). */
  requiredCredentials: string[];
  create: () => A;
  createMock: () => A;
}

export type AdapterMode = "live" | "mock";

export class IntegrationRegistry {
  private readonly defs = new Map<string, AdapterDefinition>();

  register<A extends IntegrationAdapter>(def: AdapterDefinition<A>): this {
    if (this.defs.has(def.code)) throw new Error(`Entegrasyon zaten kayıtlı: ${def.code}`);
    this.defs.set(def.code, def as AdapterDefinition);
    return this;
  }

  has(code: string) {
    return this.defs.has(code);
  }

  codes() {
    return [...this.defs.keys()].sort();
  }

  /**
   * Bağlama göre adaptör seçer. Gerçek adaptör yalnızca tüm zorunlu kimlik bilgileri varsa
   * ve mod "mock"a zorlanmamışsa kullanılır.
   */
  resolve<A extends IntegrationAdapter = IntegrationAdapter>(
    code: string,
    ctx: Pick<IntegrationContext, "credentials">,
    forceMode?: AdapterMode,
  ): { adapter: A; mode: AdapterMode } {
    const def = this.defs.get(code);
    if (!def) throw new Error(`Bilinmeyen entegrasyon: ${code}`);
    const hasCreds = def.requiredCredentials.every((k) => Boolean(ctx.credentials[k]));
    const mode: AdapterMode = forceMode === "mock" || !hasCreds ? "mock" : "live";
    return { adapter: (mode === "live" ? def.create() : def.createMock()) as A, mode };
  }
}
