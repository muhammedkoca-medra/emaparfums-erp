import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { addMonths, computeChurnRisk, type SubscribeRequest, subscribeSchema } from "@atelier/shared";
import { Prisma as DbPrisma } from "@atelier/db";
import { ApiZodBody, ZodPipe } from "../common/zod.js";
import { RequirePermission } from "../permissions/decorators.js";
import { PrismaService } from "../prisma.service.js";

/** Abonelik (F5-05/06 · SDK). Plan, abonelik, iptal; tahsilat worker'da (ODM-08). */
@ApiTags("subscription")
@Controller("subscriptions")
export class SubscriptionController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("plans")
  @RequirePermission("loyalty", "VIEW")
  async plans() {
    const rows = await this.prisma.subscriptionPlan.findMany({ orderBy: { price: "asc" } });
    return rows.map((p) => ({ id: p.id, code: p.code, name: p.name, price: p.price.toFixed(2), intervalMonths: p.intervalMonths, samplesPerBox: p.samplesPerBox, sampleMl: p.sampleMl.toString() }));
  }

  @Get()
  @RequirePermission("loyalty", "VIEW")
  async list() {
    const rows = await this.prisma.subscription.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { plan: { select: { code: true, name: true } }, customer: { select: { fullName: true } } } });
    return rows.map((s) => ({ id: s.id, status: s.status, plan: s.plan, customer: s.customer.fullName, nextBillingAt: s.nextBillingAt.toISOString(), churnRisk: s.churnRisk?.toString() ?? null }));
  }

  /** SDK-04: abonelik başlatır. Kart verisi tutulmaz; yalnızca sağlayıcı token'ı (paymentToken). */
  @Post()
  @RequirePermission("loyalty", "CREATE")
  @ApiZodBody(subscribeSchema)
  async subscribe(@Body(new ZodPipe(subscribeSchema)) body: SubscribeRequest) {
    const [customer, plan] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id: body.customerId }, select: { id: true } }),
      this.prisma.subscriptionPlan.findUnique({ where: { id: body.planId } }),
    ]);
    if (!customer) throw new NotFoundException({ message: "Müşteri bulunamadı" });
    if (!plan) throw new NotFoundException({ message: "Plan bulunamadı" });
    const sub = await this.prisma.subscription.create({
      data: { customerId: body.customerId, planId: body.planId, status: "ACTIVE", paymentToken: body.paymentToken ?? null, nextBillingAt: addMonths(new Date(), plan.intervalMonths) },
    });
    return { id: sub.id, status: sub.status, nextBillingAt: sub.nextBillingAt.toISOString() };
  }

  @Post(":id/cancel")
  @RequirePermission("loyalty", "EDIT")
  async cancel(@Param("id") id: string) {
    const sub = await this.prisma.subscription.findUnique({ where: { id } });
    if (!sub) throw new NotFoundException({ message: "Abonelik bulunamadı" });
    await this.prisma.subscription.update({ where: { id }, data: { status: "CANCELLED" } });
    return { id, status: "CANCELLED" };
  }

  @Post(":id/pause")
  @RequirePermission("loyalty", "EDIT")
  async pause(@Param("id") id: string) {
    const sub = await this.prisma.subscription.findUnique({ where: { id } });
    if (!sub) throw new NotFoundException({ message: "Abonelik bulunamadı" });
    if (sub.status !== "ACTIVE") throw new BadRequestException({ message: "Yalnızca aktif abonelik duraklatılır" });
    await this.prisma.subscription.update({ where: { id }, data: { status: "PAUSED" } });
    return { id, status: "PAUSED" };
  }

  /** SDK-06: ayrılma riskini yeniden hesaplar (son kutu açılışı + PAST_DUE + memnuniyet). */
  @Post(":id/churn-risk")
  @RequirePermission("loyalty", "EDIT")
  async churnRisk(@Param("id") id: string) {
    const sub = await this.prisma.subscription.findUnique({ where: { id }, include: { boxes: { orderBy: { period: "desc" }, take: 12 } } });
    if (!sub) throw new NotFoundException({ message: "Abonelik bulunamadı" });
    const lastOpened = sub.boxes.map((b) => b.openedAt).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0];
    const daysSince = lastOpened ? Math.floor((Date.now() - lastOpened.getTime()) / 86_400_000) : Math.floor((Date.now() - sub.createdAt.getTime()) / 86_400_000);
    const ratings = sub.boxes.map((b) => b.rating).filter((r): r is number => r != null);
    const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
    const risk = computeChurnRisk({ daysSinceLastActivity: daysSince, pastDue: sub.status === "PAST_DUE", avgRating });
    await this.prisma.subscription.update({ where: { id }, data: { churnRisk: new DbPrisma.Decimal(risk) } });
    return { id, churnRisk: risk };
  }
}
