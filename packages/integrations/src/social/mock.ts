import { randomUUID } from "node:crypto";
import { type IntegrationAdapter, type IntegrationContext, type SocialCapabilities } from "../adapter.js";
import { invoke } from "../invoke.js";

/** Sahte sosyal medya adaptörü (META/TIKTOK/INSTAGRAM…): ağa çıkmaz, yerelde yayın ve metrik sentezler. */
export class SocialMockAdapter implements IntegrationAdapter, SocialCapabilities {
  readonly kind = "SOCIAL" as const;
  constructor(readonly code: string) {}

  healthCheck(ctx: IntegrationContext) {
    return invoke(ctx, "health.check", async () => ({ ok: true, message: "mock" }), { delay: async () => {} });
  }
  publish(ctx: IntegrationContext, post: { caption: string; assetUrls?: string[] }) {
    return invoke(ctx, "social.publish", async () => ({ externalId: `${this.code.toLowerCase()}_${randomUUID().slice(0, 10)}` }), { delay: async () => {}, request: { len: post.caption.length } });
  }
  metrics(ctx: IntegrationContext, _externalId: string) {
    return invoke(
      ctx,
      "social.metrics",
      async () => {
        const reach = 1000 + Math.floor(Math.random() * 9000);
        const engagement = Math.floor(reach * (0.02 + Math.random() * 0.06));
        const clicks = Math.floor(engagement * (0.1 + Math.random() * 0.3));
        return { reach, engagement, clicks };
      },
      { delay: async () => {} },
    );
  }
}
