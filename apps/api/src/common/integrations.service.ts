import { Inject, Injectable } from "@nestjs/common";
import { integrationLogSink } from "@atelier/db";
import {
  buildContext,
  type CargoCapabilities,
  createDefaultRegistry,
  MemoryLogSink,
  type EInvoiceCapabilities,
  type FxCapabilities,
  type IntegrationAdapter,
  type IntegrationContext,
  type IntegrationRegistry,
  type MarketplaceCapabilities,
  PAYMENT_CODES,
  type PaymentCapabilities,
  resolveCredentials,
  type SocialCapabilities,
} from "@atelier/integrations";
import { APP_CONFIG, type AppConfig } from "../config.js";
import { PrismaService } from "../prisma.service.js";

/**
 * Dış sistem adaptörlerine tek erişim noktası (CLAUDE.md kural 8). Yerelde mock modda çalışır;
 * IntegrationLog'a maskeli yazar. Kimlik bilgileri yalnızca Integration.credentialsRef üzerinden çözülür.
 */
@Injectable()
export class IntegrationsService {
  private readonly registry: IntegrationRegistry = createDefaultRegistry();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Bir entegrasyon kodu için adaptör + bağlam çözer (mod: config'e göre). */
  async resolve<A extends IntegrationAdapter>(code: string, direction: "IN" | "OUT" = "OUT"): Promise<{ adapter: A; ctx: IntegrationContext; mode: string }> {
    const integration = await this.prisma.integration.findUnique({ where: { code } });
    const credentials = resolveCredentials(integration?.credentialsRef);
    const { adapter, mode } = this.registry.resolve<A>(code, { credentials }, this.config.INTEGRATIONS_MODE === "mock" ? "mock" : undefined);
    const ctx = buildContext({
      integrationId: integration?.id ?? code,
      credentials,
      settings: (integration?.settings as Record<string, unknown>) ?? {},
      sink: integration ? integrationLogSink(this.prisma) : new MemoryLogSink(),
      direction,
    });
    return { adapter, ctx, mode };
  }

  /** E-belge entegratörü (mock: e-Arşiv/e-Fatura). */
  einvoice(direction: "IN" | "OUT" = "OUT") {
    return this.resolve<IntegrationAdapter & EInvoiceCapabilities>("EINVOICE", direction);
  }

  /** Kargo entegratörü (mock). code: CARGO_YURTICI / CARGO_ARAS. */
  cargo(code: string, direction: "IN" | "OUT" = "OUT") {
    return this.resolve<IntegrationAdapter & CargoCapabilities>(code, direction);
  }

  /** Pazaryeri entegratörü (mock). code: TRENDYOL / HEPSIBURADA. */
  marketplace(code: string, direction: "IN" | "OUT" = "OUT") {
    return this.resolve<IntegrationAdapter & MarketplaceCapabilities>(code, direction);
  }

  /** Ödeme sağlayıcısı (mock). Entegrasyonsuz sağlayıcı (havale, kapıda ödeme…) için null. */
  async payment(code: string) {
    if (!(PAYMENT_CODES as readonly string[]).includes(code)) return null;
    return this.resolve<IntegrationAdapter & PaymentCapabilities>(code, "OUT");
  }

  /** Döviz kuru entegratörü (mock TCMB). */
  fx(direction: "IN" | "OUT" = "IN") {
    return this.resolve<IntegrationAdapter & FxCapabilities>("FX_TCMB", direction);
  }

  /** Sosyal medya entegratörü (mock). code: META / TIKTOK / INSTAGRAM… */
  social(code: string, direction: "IN" | "OUT" = "OUT") {
    return this.resolve<IntegrationAdapter & SocialCapabilities>(code, direction);
  }
}
