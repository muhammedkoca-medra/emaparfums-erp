import { BadRequestException, Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { checkContentCompliance, type ContentBriefRequest, contentBriefSchema, generateCaption } from "@atelier/shared";
import { ApiZodBody, ZodPipe } from "../common/zod.js";
import { RequirePermission } from "../permissions/decorators.js";
import { PrismaService } from "../prisma.service.js";

/**
 * İçerik stüdyosu (F4-10 · ICR). Brif → metin (yerelde mock üretim; gerçek CLAUDE ağa çıkışta),
 * uyum kuralı kontrolü (ICR-05: tıbbi/mutlak iddia yasak). Görsel üretimi (ICR-04) ADR'ye bağlı, ayrı.
 */
@ApiTags("content")
@Controller("content")
export class ContentController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("briefs")
  @RequirePermission("content", "VIEW")
  async briefs() {
    const rows = await this.prisma.contentBrief.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { assets: true } });
    return rows.map((b) => ({ id: b.id, kind: b.kind, tone: b.tone, channels: b.channels, keywords: b.keywords, productId: b.productId, assets: b.assets.map((a) => ({ id: a.id, kind: a.kind, body: a.body })) }));
  }

  @Post("briefs")
  @RequirePermission("content", "CREATE")
  @ApiZodBody(contentBriefSchema)
  async createBrief(@Body(new ZodPipe(contentBriefSchema)) body: ContentBriefRequest) {
    const brief = await this.prisma.contentBrief.create({ data: { productId: body.productId ?? null, kind: body.kind, channels: body.channels, tone: body.tone, audience: body.audience ?? null, keywords: body.keywords } });
    return { id: brief.id };
  }

  /** ICR-02/05: brifden metin üretir (mock), uyum kuralını kontrol eder; ihlal varsa taslak asset yazılır ama işaretlenir. */
  @Post("briefs/:id/generate")
  @RequirePermission("content", "EDIT")
  async generate(@Param("id") id: string) {
    const brief = await this.prisma.contentBrief.findUnique({ where: { id } });
    if (!brief) throw new BadRequestException({ message: "Brif bulunamadı" });
    const product = brief.productId ? await this.prisma.product.findUnique({ where: { id: brief.productId }, select: { name: true } }) : null;
    const caption = generateCaption({ productName: product?.name ?? null, tone: brief.tone, keywords: brief.keywords, kind: brief.kind });
    const violations = checkContentCompliance(caption);
    const asset = await this.prisma.contentAsset.create({ data: { briefId: brief.id, kind: "TEXT", body: caption } });
    return { assetId: asset.id, caption, compliant: violations.length === 0, violations };
  }

  /** Uyum kontrolü ayrı uç (elle yazılan metin için). */
  @Post("compliance-check")
  @RequirePermission("content", "VIEW")
  async complianceCheck(@Body() body: { text: string }) {
    if (typeof body.text !== "string") throw new BadRequestException({ message: "text gerekli" });
    const violations = checkContentCompliance(body.text);
    return { compliant: violations.length === 0, violations };
  }
}
