import { randomUUID } from "node:crypto";
import { type IntegrationAdapter, type IntegrationContext, type MessagingCapabilities } from "../adapter.js";
import { invoke } from "../invoke.js";

/** Sahte mesajlaşma adaptörü (SMS/WHATSAPP): ağa çıkmaz, mesaj kimliği üretir. */
export class MessagingMockAdapter implements IntegrationAdapter, MessagingCapabilities {
  readonly kind = "MESSAGING" as const;
  constructor(readonly code: string) {}

  healthCheck(ctx: IntegrationContext) {
    return invoke(ctx, "health.check", async () => ({ ok: true, message: "mock" }), { delay: async () => {} });
  }

  send(ctx: IntegrationContext, msg: { to: string; template: string; body: string }) {
    return invoke(
      ctx,
      "messaging.send",
      async () => ({ messageId: `${this.code.toLowerCase()}_${randomUUID()}` }),
      { delay: async () => {}, request: { to: msg.to, template: msg.template } },
    );
  }
}
