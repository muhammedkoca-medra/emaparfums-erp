import { randomUUID } from "node:crypto";
import { type IntegrationAdapter, type IntegrationContext, type MarketplaceCapabilities } from "../adapter.js";
import { invoke } from "../invoke.js";

/** Sahte pazaryeri adaptörü (Trendyol/Hepsiburada): ağa çıkmaz. Sipariş çekme yerelde sentezlenir. */
export class MarketplaceMockAdapter implements IntegrationAdapter, MarketplaceCapabilities {
  readonly kind = "MARKETPLACE" as const;
  constructor(readonly code: string) {}

  healthCheck(ctx: IntegrationContext) {
    return invoke(ctx, "health.check", async () => ({ ok: true, message: "mock" }), { delay: async () => {} });
  }
  pullOrders(ctx: IntegrationContext, _since: Date) {
    return invoke(ctx, "marketplace.pull_orders", async () => [] as unknown[], { delay: async () => {} });
  }
  pushStock(ctx: IntegrationContext, items: { sku: string; qty: number }[]) {
    return invoke(ctx, "marketplace.push_stock", async () => undefined, { delay: async () => {}, request: { count: items.length } });
  }
  pushPrice(ctx: IntegrationContext, items: { sku: string; price: string }[]) {
    return invoke(ctx, "marketplace.push_price", async () => undefined, { delay: async () => {}, request: { count: items.length } });
  }
  upsertListing(ctx: IntegrationContext, _listing: unknown) {
    return invoke(ctx, "marketplace.upsert_listing", async () => ({ externalId: `${this.code.toLowerCase()}_${randomUUID().slice(0, 8)}` }), { delay: async () => {} });
  }
  pullSettlements(ctx: IntegrationContext, _from: Date, _to: Date) {
    return invoke(ctx, "marketplace.pull_settlements", async () => [] as unknown[], { delay: async () => {} });
  }
}
