import { Controller, Get, NotFoundException, Param } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { type Gender, type ScentProfile, type ShowcaseProduct, scentProfileSchema } from "@atelier/shared";
import { Public } from "../permissions/decorators.js";
import { PrismaService } from "../prisma.service.js";

/**
 * Vitrin (herkese açık, oturumsuz). Yalnızca ACTIVE ürünlerin güvenli koku profilini döndürür.
 * İç veri (fiyat, stok, maliyet, formül) ve referans marka ASLA dönmez (docs/07-guvenlik-kvkk.md).
 */
@ApiTags("showcase")
@Controller("showcase")
export class ShowcaseController {
  constructor(private readonly prisma: PrismaService) {}

  /** scentProfile Json alanını güvenli vitrin görünümüne indirger; referans marka/ad çıkarılır. */
  private toShowcase(p: {
    id: string;
    sku: string;
    name: string;
    concentration: string;
    volumeMl: number;
    scentProfile: unknown;
    media: { url: string }[];
  }): ShowcaseProduct | null {
    const parsed = scentProfileSchema.safeParse(p.scentProfile);
    if (!parsed.success) return null;
    const profile: ScentProfile = parsed.data;
    return {
      id: p.id,
      slug: p.sku,
      name: p.name,
      gender: profile.gender as Gender,
      concentration: p.concentration,
      volumeMl: p.volumeMl,
      accords: profile.accords,
      dayPct: profile.dayPct,
      seasons: profile.seasons,
      imageUrl: p.media[0]?.url ?? null,
    };
  }

  private static readonly SELECT = {
    id: true,
    sku: true,
    name: true,
    concentration: true,
    volumeMl: true,
    scentProfile: true,
    media: { where: { role: "NOTES_CARD" as const }, orderBy: { sortOrder: "asc" as const }, select: { url: true }, take: 1 },
  };

  @Get("products")
  @Public()
  async list(): Promise<ShowcaseProduct[]> {
    const rows = await this.prisma.product.findMany({
      where: { status: "ACTIVE", scentProfile: { not: undefined } },
      orderBy: { name: "asc" },
      select: ShowcaseController.SELECT,
    });
    return rows.map((r) => this.toShowcase(r)).filter((p): p is ShowcaseProduct => p !== null);
  }

  @Get("products/:slug")
  @Public()
  async get(@Param("slug") slug: string): Promise<ShowcaseProduct> {
    const p = await this.prisma.product.findFirst({
      where: { sku: slug.toUpperCase(), status: "ACTIVE" },
      select: ShowcaseController.SELECT,
    });
    const view = p && this.toShowcase(p);
    if (!view) throw new NotFoundException({ message: "Ürün bulunamadı" });
    return view;
  }
}
