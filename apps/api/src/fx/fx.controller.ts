import { Controller, Get, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IntegrationsService } from "../common/integrations.service.js";
import { Authenticated, RequirePermission } from "../permissions/decorators.js";
import { PrismaService } from "../prisma.service.js";

/** Döviz kuru (F2-17 · FX_TCMB mock). Günlük kur çekilir ve arşivlenir; belgeler kendi kurunu kopyalar. */
@ApiTags("fx")
@Controller("fx")
export class FxController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
  ) {}

  /** En güncel kurlar (para birimi başına son tarih). */
  @Get("rates")
  @Authenticated()
  async rates() {
    const rows = await this.prisma.fxRate.findMany({ orderBy: [{ quote: "asc" }, { date: "desc" }], take: 100 });
    const latest = new Map<string, (typeof rows)[number]>();
    for (const r of rows) if (!latest.has(r.quote)) latest.set(r.quote, r);
    return [...latest.values()].map((r) => ({ quote: r.quote, base: r.base, rate: r.rate.toString(), date: r.date.toISOString().slice(0, 10), source: r.source }));
  }

  /** Kurları entegratörden çekip bugün için arşivler (idempotent: quote+date benzersiz). */
  @Post("refresh")
  @RequirePermission("invoicing", "EDIT")
  async refresh() {
    const { adapter, ctx } = await this.integrations.fx();
    const rates = await adapter.latestRates(ctx);
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    const written: string[] = [];
    for (const [quote, rate] of Object.entries(rates)) {
      await this.prisma.fxRate.upsert({
        where: { quote_date: { quote, date } },
        update: { rate, source: "FX_TCMB" },
        create: { quote, rate, date, base: "TRY", source: "FX_TCMB" },
      });
      written.push(quote);
    }
    return { date: date.toISOString().slice(0, 10), quotes: written };
  }
}
