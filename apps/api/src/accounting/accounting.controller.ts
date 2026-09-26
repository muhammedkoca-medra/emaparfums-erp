import { BadRequestException, Controller, Get, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../permissions/decorators.js";
import { PrismaService } from "../prisma.service.js";
import { type AuthedRequest } from "../auth/auth-context.js";

/**
 * Muhasebe aktarımı (F4-06 · FTR-09). Gerçek muhasebe sistemi seçimi ADR-0003'e bağlıdır; burada
 * fatura satırlarından yevmiye taslağı üretilir ve mali müşavir için dışa aktarılır (mock).
 * Kesin hesap planı/entegrasyon ADR-0003 ile netleşene kadar parametrik ve salt-okunurdur.
 */
@ApiTags("accounting")
@Controller("accounting")
export class AccountingController {
  constructor(private readonly prisma: PrismaService) {}

  private range(period: string) {
    const m = /^(\d{4})-(\d{2})$/.exec(period);
    if (!m) throw new BadRequestException({ message: "Dönem biçimi YYYY-MM olmalı" });
    const y = Number(m[1]);
    const mo = Number(m[2]);
    if (mo < 1 || mo > 12) throw new BadRequestException({ message: "Ay 01–12 olmalı" });
    return { start: new Date(Date.UTC(y, mo - 1, 1)), end: new Date(Date.UTC(y, mo, 1)) };
  }

  /** Dönemin yevmiye taslağı (satış hasılat + hesaplanan KDV; alış gider + indirilecek KDV). */
  @Get("journal")
  @RequirePermission("invoicing", "VIEW")
  async journal(@Query("period") period: string) {
    const { start, end } = this.range(period);
    const invoices = await this.prisma.invoice.findMany({
      where: { issueDate: { gte: start, lt: end }, status: { not: "CANCELLED" } },
      select: { id: true, number: true, direction: true, netTotal: true, kdvTotal: true, otvTotal: true, grandTotal: true, issueDate: true },
    });
    const entries = invoices.map((inv) => {
      const sales = inv.direction === "SALES";
      // Basit yevmiye taslağı (hesap kodları ADR-0003 ile netleşecek; şimdilik açıklayıcı).
      const lines = sales
        ? [
            { account: "120 Alıcılar", debit: inv.grandTotal.toFixed(2), credit: "0.00" },
            { account: "600 Yurtiçi Satışlar", debit: "0.00", credit: inv.netTotal.toFixed(2) },
            { account: "391 Hesaplanan KDV", debit: "0.00", credit: inv.kdvTotal.toFixed(2) },
            ...(Number(inv.otvTotal) > 0 ? [{ account: "391 Hesaplanan ÖTV", debit: "0.00", credit: inv.otvTotal.toFixed(2) }] : []),
          ]
        : [
            { account: "153 Ticari Mallar / 740 Gider", debit: inv.netTotal.toFixed(2), credit: "0.00" },
            { account: "191 İndirilecek KDV", debit: inv.kdvTotal.toFixed(2), credit: "0.00" },
            { account: "320 Satıcılar", debit: "0.00", credit: inv.grandTotal.toFixed(2) },
          ];
      return { invoice: inv.number, direction: inv.direction, date: inv.issueDate.toISOString().slice(0, 10), lines };
    });
    return { period, count: entries.length, entries, note: "ADR-0003 (muhasebe entegrasyonu) beklemede; taslak hesap kodları." };
  }

  /** Yevmiye taslağını CSV olarak dışa aktarır (mali müşavir; mock). */
  @Get("journal/export")
  @RequirePermission("invoicing", "VIEW")
  async journalExport(@Query("period") period: string, @Req() req: AuthedRequest) {
    const j = await this.journal(period);
    const rows = ["Fatura;Yon;Tarih;Hesap;Borc;Alacak"];
    for (const e of j.entries) for (const l of e.lines) rows.push(`${e.invoice};${e.direction};${e.date};${l.account};${l.debit};${l.credit}`);
    const res = req.res!;
    res.setHeader("content-type", "text/csv; charset=utf-8");
    res.setHeader("content-disposition", `attachment; filename="yevmiye-${period}.csv"`);
    res.end("﻿" + rows.join("\n"));
  }
}
