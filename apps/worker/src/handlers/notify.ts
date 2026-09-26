import { integrationLogSink } from "@atelier/db";
import {
  buildContext,
  createDefaultRegistry,
  type IntegrationAdapter,
  MemoryLogSink,
  type MessagingCapabilities,
  resolveCredentials,
} from "@atelier/integrations";
import { maskPhone } from "@atelier/shared";
import { decryptField, keyringFromEnv } from "@atelier/shared/node";
import { type Db } from "@atelier/db";

const registry = createDefaultRegistry();

interface NotifyInput {
  customerId: string;
  channel: "SMS" | "WHATSAPP";
  purpose: "TRANSACTIONAL" | "MARKETING";
  template: string;
  body: string;
  refType?: string;
  refId?: string;
}

/**
 * Müşteriye bildirim gönderir ve NotificationLog yazar.
 *  - MARKETING: güncel marketingConsentAt (İYS) yoksa BLOCKED.
 *  - İşlem bildirimleri rıza gerektirmez. Telefon yoksa FAILED.
 *  - Telefon çözülür (şifreli), loga maskeli yazılır.
 */
export async function notifyCustomer(prisma: Db, input: NotifyInput): Promise<void> {
  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
    select: { id: true, phone: true, marketingConsentAt: true },
  });
  if (!customer) return;

  const log = (status: "SENT" | "FAILED" | "BLOCKED", toMasked: string, reason?: string) =>
    prisma.notificationLog.create({
      data: { customerId: customer.id, channel: input.channel, purpose: input.purpose, template: input.template, toMasked, status, reason: reason ?? null, refType: input.refType ?? null, refId: input.refId ?? null },
    });

  if (input.purpose === "MARKETING" && !customer.marketingConsentAt) {
    await log("BLOCKED", "", "Pazarlama rızası yok (İYS)");
    return;
  }
  const phone = customer.phone ? decryptField(keyringFromEnv(), customer.phone) : null;
  const masked = maskPhone(phone ?? "");
  if (!phone) {
    await log("FAILED", "", "Telefon yok");
    return;
  }

  const integration = await prisma.integration.findUnique({ where: { code: input.channel } });
  const credentials = resolveCredentials(integration?.credentialsRef);
  const { adapter } = registry.resolve<IntegrationAdapter & MessagingCapabilities>(input.channel, { credentials }, "mock");
  const ctx = buildContext({ integrationId: integration?.id ?? input.channel, credentials, sink: integration ? integrationLogSink(prisma) : new MemoryLogSink() });
  try {
    await adapter.send(ctx, { to: phone, template: input.template, body: input.body });
    await log("SENT", masked);
  } catch (e) {
    await log("FAILED", masked, e instanceof Error ? e.message : "hata");
  }
}
