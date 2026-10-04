import { earnedPoints, selectTier } from "@atelier/shared";
import { type EventHandler } from "./index.js";

/**
 * SDK-01/02: order.confirmed → müşteri sadakat hesabına puan kazandırır ve seviyeyi günceller.
 * Idempotent: aynı sipariş için ORDER puanı bir kez yazılır.
 */
export const earnLoyaltyOnOrderConfirmed: EventHandler<"order.confirmed"> = async (event, { prisma, log, eventId }) => {
  const order = await prisma.salesOrder.findUnique({ where: { id: event.orderId }, select: { id: true, customerId: true, netTotal: true } });
  if (!order?.customerId) return;
  if (await prisma.loyaltyTransaction.findFirst({ where: { reason: "ORDER", refId: order.id } })) return;
  const tiers = await prisma.loyaltyTier.findMany();
  if (tiers.length === 0) return;
  const base = selectTier(0, tiers);
  if (!base) return;

  await prisma.$transaction(async (tx) => {
    let account = await tx.loyaltyAccount.findUnique({ where: { customerId: order.customerId! } });
    if (!account) account = await tx.loyaltyAccount.create({ data: { customerId: order.customerId!, tierId: base.id, points: 0 } });
    const tier = tiers.find((t) => t.id === account!.tierId) ?? base;
    const points = earnedPoints(order.netTotal.toString(), tier.earnPct.toString());
    if (points <= 0) return;
    await tx.loyaltyTransaction.create({ data: { accountId: account.id, points, reason: "ORDER", refId: order.id } });
    const balance = account.points + points;
    const newTier = selectTier(balance, tiers) ?? tier;
    await tx.loyaltyAccount.update({ where: { id: account.id }, data: { points: balance, tierId: newTier.id } });
    log.info({ eventId, orderId: order.id, points, tier: newTier.code }, "order.confirmed → sadakat puanı kazandırıldı");
  });
};

/**
 * order.cancelled → siparişten kazanılan puan geri alınır (ORDER_CANCEL, eksi). Bakiye 0'ın altına
 * inmez; seviye yeniden hesaplanır. Idempotent: aynı sipariş için bir kez yazılır.
 */
export const reverseLoyaltyOnOrderCancelled: EventHandler<"order.cancelled"> = async (event, { prisma, log, eventId }) => {
  const earned = await prisma.loyaltyTransaction.findFirst({ where: { reason: "ORDER", refId: event.orderId } });
  if (!earned || earned.points <= 0) return;
  if (await prisma.loyaltyTransaction.findFirst({ where: { reason: "ORDER_CANCEL", refId: event.orderId } })) return;
  const tiers = await prisma.loyaltyTier.findMany();
  await prisma.$transaction(async (tx) => {
    const account = await tx.loyaltyAccount.findUniqueOrThrow({ where: { id: earned.accountId } });
    const take = Math.min(earned.points, account.points);
    await tx.loyaltyTransaction.create({ data: { accountId: account.id, points: -take, reason: "ORDER_CANCEL", refId: event.orderId } });
    const balance = account.points - take;
    const tier = selectTier(balance, tiers);
    await tx.loyaltyAccount.update({ where: { id: account.id }, data: { points: balance, ...(tier ? { tierId: tier.id } : {}) } });
    log.info({ eventId, orderId: event.orderId, points: -take }, "order.cancelled → sadakat puanı geri alındı");
  });
};
