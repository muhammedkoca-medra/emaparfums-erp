import { emit } from "@atelier/db";
import {
  buildContext,
  createDefaultRegistry,
  MemoryLogSink,
  type EInvoiceCapabilities,
  type IntegrationAdapter,
  resolveCredentials,
} from "@atelier/integrations";
import { decryptField, keyringFromEnv } from "@atelier/shared/node";
import { integrationLogSink } from "@atelier/db";
import { type EventHandler } from "./index.js";

const registry = createDefaultRegistry();

/**
 * order.confirmed → satış faturası oluşturur (FTR-01/02/03/10).
 *  - Alıcı e-Fatura mükellefiyse E_FATURA, değilse E_ARSIV (mock mükellef sorgusu).
 *  - Tutarlar sipariş satırlarındaki vergi anlık görüntüsünden kopyalanır (yeniden hesaplanmaz).
 *  - Kurumsalda VKN yoksa belge ERROR (FTR-04). Numara/ETTN entegratörden gelir.
 *  - Idempotent: siparişin zaten faturası varsa çıkar.
 */
export const orderConfirmed: EventHandler<"order.confirmed"> = async (event, { prisma, log, eventId }) => {
  const order = await prisma.salesOrder.findUnique({
    where: { id: event.orderId },
    include: { customer: true, channel: true, lines: { include: { product: { select: { id: true, name: true } } } } },
  });
  if (!order) return;
  if (await prisma.invoice.findFirst({ where: { orderId: order.id, direction: "SALES", type: { not: "RETURN" } } })) return;
  if (!order.customer) return;

  const keyring = keyringFromEnv();
  const taxNo = order.customer.taxNo ? decryptField(keyring, order.customer.taxNo) : null;
  const isCorporate = order.customer.type === "CORPORATE";

  const lineData = order.lines.map((l) => {
    const net = l.netAmount;
    const unit = l.qty > 0 ? net.div(l.qty) : net;
    return {
      productId: l.productId,
      description: l.product?.name ?? "Ürün",
      qty: l.qty,
      unitPrice: unit,
      netAmount: net,
      otvRate: l.otvRate,
      otvAmount: l.otvAmount,
      kdvRate: l.kdvRate,
      kdvAmount: l.kdvAmount,
    };
  });

  // FTR-04: kurumsal alıcıda VKN zorunlu; eksikse hata belgesi.
  if (isCorporate && !taxNo) {
    const inv = await prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          direction: "SALES",
          type: "E_FATURA",
          status: "ERROR",
          issueDate: new Date(),
          orderId: order.id,
          customerId: order.customerId,
          currency: order.currency,
          netTotal: order.netTotal,
          otvTotal: order.otvTotal,
          kdvBase: order.netTotal.add(order.otvTotal),
          kdvTotal: order.kdvTotal,
          grandTotal: order.grandTotal,
          errorMessage: "Kurumsal alıcıda VKN eksik (FTR-04)",
          lines: { create: lineData },
        },
      });
      await emit(tx, { type: "invoice.failed", invoiceId: created.id, error: "VKN eksik" });
      return created;
    });
    log.warn({ eventId, orderId: order.id, invoiceId: inv.id }, "fatura ERROR: VKN eksik");
    return;
  }

  // Entegratör: mükellef sorgusu + belge türü.
  const integration = await prisma.integration.findUnique({ where: { code: "EINVOICE" } });
  const credentials = resolveCredentials(integration?.credentialsRef);
  const { adapter } = registry.resolve<IntegrationAdapter & EInvoiceCapabilities>("EINVOICE", { credentials }, "mock");
  const ctx = buildContext({ integrationId: integration?.id ?? "EINVOICE", credentials, sink: integration ? integrationLogSink(prisma) : new MemoryLogSink() });

  const eInvoiceUser = taxNo ? await adapter.isEInvoiceUser(ctx, taxNo) : false;
  const type = order.channel.type === "EXPORT" ? "E_IHRACAT" : eInvoiceUser ? "E_FATURA" : "E_ARSIV";

  const invoice = await prisma.invoice.create({
    data: {
      direction: "SALES",
      type,
      status: "DRAFT",
      issueDate: new Date(),
      orderId: order.id,
      customerId: order.customerId,
      currency: order.currency,
      netTotal: order.netTotal,
      otvTotal: order.otvTotal,
      kdvBase: order.netTotal.add(order.otvTotal),
      kdvTotal: order.kdvTotal,
      grandTotal: order.grandTotal,
      lines: { create: lineData },
    },
  });

  try {
    const res = await adapter.send(ctx, { invoiceId: invoice.id, type, taxNo, customer: order.customer.fullName });
    await prisma.$transaction(async (tx) => {
      await tx.invoice.update({ where: { id: invoice.id }, data: { number: res.number, ettn: res.ettn, status: "SENT" } });
      await emit(tx, { type: "invoice.issued", invoiceId: invoice.id });
    });
    log.info({ eventId, orderId: order.id, invoiceId: invoice.id, number: res.number, type }, "fatura kesildi");
  } catch (err) {
    const message = err instanceof Error ? err.message : "entegratör hatası";
    await prisma.$transaction(async (tx) => {
      await tx.invoice.update({ where: { id: invoice.id }, data: { status: "ERROR", errorMessage: message } });
      await emit(tx, { type: "invoice.failed", invoiceId: invoice.id, error: message });
    });
    log.error({ eventId, orderId: order.id, invoiceId: invoice.id, err: message }, "fatura kesilemedi");
  }
};
