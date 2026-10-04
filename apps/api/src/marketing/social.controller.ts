import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Post, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { emit, Prisma, writeAudit } from "@atelier/db";
import { checkContentCompliance, type SocialPostRequest, socialPostSchema } from "@atelier/shared";
import { type AuthContext, type AuthedRequest, clientInfo, CurrentUser } from "../auth/auth-context.js";
import { ApiZodBody, ZodPipe } from "../common/zod.js";
import { IntegrationsService } from "../common/integrations.service.js";
import { RequirePermission } from "../permissions/decorators.js";
import { PrismaService } from "../prisma.service.js";

/**
 * Sosyal medya (F4-09 · SOS). Takvim, onay akışı, yayın (META/TIKTOK mock), metrik + UTM atfı.
 *  - SOS: DRAFT → PENDING_APPROVAL → SCHEDULED/PUBLISHED. Uyum ihlali olan metin yayınlanamaz.
 */
@ApiTags("social")
@Controller("social")
export class SocialController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
  ) {}

  @Get("accounts")
  @RequirePermission("social", "VIEW")
  async accounts() {
    const rows = await this.prisma.socialAccount.findMany({ orderBy: { platform: "asc" } });
    return rows.map((a) => ({ id: a.id, platform: a.platform, handle: a.handle }));
  }

  /** Takvim: tarih aralığındaki gönderiler. */
  @Get("posts")
  @RequirePermission("social", "VIEW")
  async posts(@Query("from") from?: string, @Query("to") to?: string) {
    const where = from || to ? { scheduledAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lt: new Date(to) } : {}) } } : {};
    const rows = await this.prisma.socialPost.findMany({ where, orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }], take: 200, include: { account: { select: { platform: true, handle: true } } } });
    return rows.map((p) => ({
      id: p.id,
      status: p.status,
      caption: p.caption,
      account: p.account,
      scheduledAt: p.scheduledAt?.toISOString() ?? null,
      publishedAt: p.publishedAt?.toISOString() ?? null,
      utmCampaign: p.utmCampaign,
      externalId: p.externalId,
      metrics: p.metrics,
    }));
  }

  @Post("posts")
  @RequirePermission("social", "CREATE")
  @ApiZodBody(socialPostSchema)
  async createPost(@Body(new ZodPipe(socialPostSchema)) body: SocialPostRequest, @CurrentUser() auth: AuthContext, @Req() req: AuthedRequest) {
    const account = await this.prisma.socialAccount.findUnique({ where: { id: body.accountId }, select: { id: true } });
    if (!account) throw new NotFoundException({ message: "Hesap bulunamadı" });
    const post = await this.prisma.socialPost.create({
      data: { accountId: body.accountId, caption: body.caption, scheduledAt: body.scheduledAt ?? null, productIds: body.productIds, utmCampaign: body.utmCampaign ?? null, briefId: body.briefId ?? null, status: "DRAFT" },
    });
    void auth;
    void req;
    return { id: post.id, status: "DRAFT" };
  }

  /** Onaya gönder (DRAFT → PENDING_APPROVAL). */
  @Post("posts/:id/submit")
  @RequirePermission("social", "EDIT")
  async submit(@Param("id") id: string) {
    const post = await this.prisma.socialPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException({ message: "Gönderi bulunamadı" });
    if (post.status !== "DRAFT") throw new ConflictException({ message: "Yalnızca taslak onaya gönderilir" });
    await this.prisma.socialPost.update({ where: { id }, data: { status: "PENDING_APPROVAL" } });
    return { id, status: "PENDING_APPROVAL" };
  }

  /** Onayla ve zamanla/yayınla. Uyum ihlali olan metin reddedilir (ICR-05). */
  @Post("posts/:id/approve")
  @RequirePermission("social", "APPROVE")
  async approve(@Param("id") id: string, @Body() body: { publishNow?: boolean }, @CurrentUser() auth: AuthContext, @Req() req: AuthedRequest) {
    const post = await this.prisma.socialPost.findUnique({ where: { id }, include: { account: true } });
    if (!post) throw new NotFoundException({ message: "Gönderi bulunamadı" });
    if (post.status !== "PENDING_APPROVAL" && post.status !== "DRAFT") throw new ConflictException({ message: "Gönderi onaya uygun değil" });
    const violations = checkContentCompliance(post.caption);
    if (violations.length) throw new BadRequestException({ message: `İçerik uyum kuralını ihlal ediyor (ICR-05): ${violations.join(", ")}` });

    if (body.publishNow) {
      const { adapter, ctx } = await this.integrations.social(post.account.platform);
      const res = await adapter.publish(ctx, { caption: post.caption });
      await this.prisma.$transaction(async (tx) => {
        await tx.socialPost.update({ where: { id }, data: { status: "PUBLISHED", publishedAt: new Date(), externalId: res.externalId } });
        await emit(tx, { type: "post.published", postId: id });
        await writeAudit(tx, { userId: auth.userId, action: "social.publish", entity: "SocialPost", entityId: id, after: { externalId: res.externalId, platform: post.account.platform }, ...clientInfo(req) });
      });
      return { id, status: "PUBLISHED", externalId: res.externalId };
    }
    await this.prisma.socialPost.update({ where: { id }, data: { status: "SCHEDULED" } });
    return { id, status: "SCHEDULED" };
  }

  /** Metrikleri çeker (mock) ve UTM ile atfedilen geliri hesaplar (SOS-06). */
  @Post("posts/:id/metrics")
  @RequirePermission("social", "EDIT")
  async fetchMetrics(@Param("id") id: string) {
    const post = await this.prisma.socialPost.findUnique({ where: { id }, include: { account: true } });
    if (!post?.externalId) throw new BadRequestException({ message: "Yalnızca yayınlanmış gönderinin metriği çekilir" });
    const { adapter, ctx } = await this.integrations.social(post.account.platform);
    const m = await adapter.metrics(ctx, post.externalId);
    // UTM atfı: kampanya koduyla eşleşen siparişlerin cirosu (varsa).
    let attributedRevenue = 0;
    if (post.utmCampaign) {
      const orders = await this.prisma.salesOrder.findMany({ where: { utmCampaign: post.utmCampaign, status: { notIn: ["NEW", "CANCELLED", "PAYMENT_PENDING"] } }, select: { grandTotal: true } });
      attributedRevenue = orders.reduce((s, o) => s + Number(o.grandTotal), 0);
    }
    const metrics = { ...m, attributedRevenue: Number(attributedRevenue.toFixed(2)) };
    await this.prisma.socialPost.update({ where: { id }, data: { metrics: metrics as Prisma.InputJsonValue } });
    return metrics;
  }
}
