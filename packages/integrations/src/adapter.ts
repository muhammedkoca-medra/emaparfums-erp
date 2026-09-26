/**
 * Tüm dış sistem adaptörlerinin uyguladığı ortak sözleşme.
 * Her sağlayıcı: packages/integrations/src/<kod>/{index.ts, mock.ts, README.md}
 */
export type IntegrationKind =
  | "MARKETPLACE"
  | "ECOMMERCE_SITE"
  | "PAYMENT"
  | "EINVOICE"
  | "CARGO"
  | "SOCIAL"
  | "MESSAGING"
  | "BANK"
  | "ACCOUNTING"
  | "FX"
  | "REGULATORY"
  | "AI";

export class IntegrationError extends Error {
  constructor(
    message: string,
    /** true: tekrar denenebilir (zaman aşımı, 429, 5xx). false: veri hatası, düzeltme gerekir. */
    public readonly retryable: boolean,
    public readonly providerCode?: string,
  ) {
    super(message);
  }
}

export interface IntegrationContext {
  integrationId: string;
  /** Gizli anahtar kasasından çözülmüş kimlik bilgileri — asla loglanmaz. */
  credentials: Record<string, string>;
  settings: Record<string, unknown>;
  log: (entry: {
    operation: string;
    status: "OK" | "ERROR" | "RETRY";
    request?: unknown;
    response?: unknown;
    durationMs?: number;
  }) => Promise<void>;
}

export interface IntegrationAdapter {
  readonly code: string;
  readonly kind: IntegrationKind;
  healthCheck(ctx: IntegrationContext): Promise<{ ok: boolean; message?: string }>;
}

/* Türe özel yetenekler — adaptör ilgili arayüzleri ek olarak uygular. */

export interface MarketplaceCapabilities {
  pullOrders(ctx: IntegrationContext, since: Date): Promise<unknown[]>;
  pushStock(ctx: IntegrationContext, items: { sku: string; qty: number }[]): Promise<void>;
  pushPrice(ctx: IntegrationContext, items: { sku: string; price: string }[]): Promise<void>;
  upsertListing(ctx: IntegrationContext, listing: unknown): Promise<{ externalId: string }>;
  pullSettlements(ctx: IntegrationContext, from: Date, to: Date): Promise<unknown[]>;
}

export interface EInvoiceCapabilities {
  isEInvoiceUser(ctx: IntegrationContext, taxNo: string): Promise<boolean>;
  send(ctx: IntegrationContext, doc: unknown): Promise<{ number: string; ettn: string }>;
  status(ctx: IntegrationContext, ettn: string): Promise<string>;
  pullIncoming(ctx: IntegrationContext, since: Date): Promise<unknown[]>;
  cancel(ctx: IntegrationContext, ettn: string, reason: string): Promise<void>;
  pdf(ctx: IntegrationContext, ettn: string): Promise<Uint8Array>;
}

export interface PaymentCapabilities {
  charge(ctx: IntegrationContext, req: unknown): Promise<{ externalTxId: string; status: string }>;
  refund(ctx: IntegrationContext, externalTxId: string, amount: string): Promise<void>;
  installmentOptions(ctx: IntegrationContext, bin: string, amount: string): Promise<unknown[]>;
}

export interface FxCapabilities {
  /** 1 <para birimi> = kaç TRY (mock: sabit/rastgele küçük oynama). */
  latestRates(ctx: IntegrationContext): Promise<Record<string, string>>;
}

export interface MessagingCapabilities {
  /** Mesaj gönderir; sağlayıcı mesaj kimliği döner. Kart/PII loglara maskeli yazılır. */
  send(ctx: IntegrationContext, msg: { to: string; template: string; body: string }): Promise<{ messageId: string }>;
}

export interface CargoCapabilities {
  createShipment(
    ctx: IntegrationContext,
    req: unknown,
  ): Promise<{ trackingNo: string; labelPdf: Uint8Array }>;
  track(ctx: IntegrationContext, trackingNo: string): Promise<{ status: string; events: unknown[] }>;
  cancel(ctx: IntegrationContext, trackingNo: string): Promise<void>;
}

export interface SocialCapabilities {
  /** Gönderiyi yayınlar; platform gönderi kimliği döner (mock). */
  publish(ctx: IntegrationContext, post: { caption: string; assetUrls?: string[] }): Promise<{ externalId: string }>;
  /** Yayınlanmış gönderinin metriklerini çeker (mock: reach/engagement/clicks). */
  metrics(ctx: IntegrationContext, externalId: string): Promise<{ reach: number; engagement: number; clicks: number }>;
}
