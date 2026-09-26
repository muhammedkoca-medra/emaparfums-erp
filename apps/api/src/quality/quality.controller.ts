import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { applicableTests, setLotQcStatus, writeAudit } from "@atelier/db";
import {
  type InspectionResultsRequest,
  inspectionResultsSchema,
  type InspectionStatus,
  type LotReleaseRequest,
  lotReleaseSchema,
  type NonConformanceRequest,
  nonConformanceSchema,
} from "@atelier/shared";
import { type AuthContext, type AuthedRequest, clientInfo, CurrentUser } from "../auth/auth-context.js";
import { ApiZodBody, ZodPipe } from "../common/zod.js";
import { RequirePermission } from "../permissions/decorators.js";
import { PrismaService } from "../prisma.service.js";

/**
 * Kalite — muayene ve lot serbest bırakma (F3-04 · docs/03-moduller/kalite.md).
 *  - KAL-01: muayeneler lot.received / batch.completed ile worker'da otomatik açılır.
 *  - KAL-02: tüm uygulanabilir testler geçince lot serbest bırakılır (quality:APPROVE) → lot.released.
 *  - KAL-03: bir test kalırsa lot REJECTED, DÖF otomatik açılır, lot.quarantined yayılır.
 */
@ApiTags("quality")
@Controller("quality")
export class QualityController {
  constructor(private readonly prisma: PrismaService) {}

  /** Lot serbest bırakma kuyruğu. */
  @Get("inspections")
  @RequirePermission("quality", "VIEW")
  async inspections(@Query("status") status?: string) {
    const rows = await this.prisma.qcInspection.findMany({
      where: status ? { status: status as InspectionStatus } : {},
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        lot: { select: { id: true, lotNo: true, qcStatus: true, item: { select: { code: true, name: true, type: true } } } },
        results: { include: { test: { select: { code: true, name: true } } } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      releasedAt: r.releasedAt?.toISOString() ?? null,
      lot: { id: r.lot.id, lotNo: r.lot.lotNo, qcStatus: r.lot.qcStatus, itemCode: r.lot.item.code, itemName: r.lot.item.name },
      results: r.results.map((res) => ({ testId: res.testId, code: res.test.code, name: res.test.name, value: res.value, passed: res.passed })),
    }));
  }

  @Get("inspections/:id")
  @RequirePermission("quality", "VIEW")
  async inspection(@Param("id") id: string) {
    const r = await this.prisma.qcInspection.findUnique({
      where: { id },
      include: { lot: { select: { id: true, lotNo: true, qcStatus: true } }, results: { include: { test: true } } },
    });
    if (!r) throw new NotFoundException({ message: "Muayene bulunamadı" });
    const tests = await this.prisma.$transaction((tx) => applicableTests(tx, r.lot.id));
    const done = new Map(r.results.map((res) => [res.testId, res]));
    return {
      id: r.id,
      status: r.status,
      lot: r.lot,
      tests: tests.map((t) => {
        const res = done.get(t.id);
        return { testId: t.id, code: t.code, name: t.name, spec: t.spec, value: res?.value ?? null, passed: res ? res.passed : null };
      }),
    };
  }

  /**
   * KAL-03: test sonuçlarını kaydeder. Bir sonuç bile kaldıysa muayene FAILED, lot REJECTED,
   * DÖF açılır ve lot.quarantined yayılır. Hepsi geçtiyse muayene TESTING'de kalır (serbest bırakmayı bekler).
   */
  @Post("inspections/:id/results")
  @RequirePermission("quality", "EDIT")
  @ApiZodBody(inspectionResultsSchema)
  async recordResults(
    @Param("id") id: string,
    @Body(new ZodPipe(inspectionResultsSchema)) body: InspectionResultsRequest,
    @CurrentUser() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const insp = await tx.qcInspection.findUnique({ where: { id }, include: { lot: { select: { id: true } } } });
      if (!insp) throw new NotFoundException({ message: "Muayene bulunamadı" });
      if (insp.status === "PASSED") throw new BadRequestException({ message: "Serbest bırakılmış muayene değiştirilemez" });
      const testIds = body.results.map((r) => r.testId);
      const valid = await tx.qcTest.findMany({ where: { id: { in: testIds } }, select: { id: true } });
      if (valid.length !== new Set(testIds).size) throw new BadRequestException({ message: "Geçersiz test" });
      // Aynı testin önceki sonucunu değiştir (tekrar ölçüm).
      await tx.qcResult.deleteMany({ where: { inspectionId: id, testId: { in: testIds } } });
      await tx.qcResult.createMany({ data: body.results.map((r) => ({ inspectionId: id, testId: r.testId, value: r.value ?? null, passed: r.passed, testedById: auth.userId })) });

      const anyFail = body.results.some((r) => !r.passed);
      if (anyFail) {
        await tx.qcInspection.update({ where: { id }, data: { status: "FAILED" } });
        const count = await tx.nonConformance.count();
        const number = `NC-${new Date().getFullYear() % 100}${String(count + 1).padStart(4, "0")}`;
        await tx.nonConformance.create({ data: { number, lotId: insp.lot.id, description: "Kalite testinde başarısızlık; lot reddedildi", ownerId: auth.userId } });
        await setLotQcStatus(tx, { lotId: insp.lot.id, status: "REJECTED", reason: `Muayene ${id}: test kaldı`, userId: auth.userId, ...clientInfo(req) });
        return { id, status: "FAILED", nonConformance: number };
      }
      await tx.qcInspection.update({ where: { id }, data: { status: "TESTING" } });
      return { id, status: "TESTING" };
    });
  }

  /**
   * KAL-02: lotu serbest bırakır. Uygulanabilir tüm testlerin geçmiş sonucu olmalı; aksi halde 400.
   * setLotQcStatus RELEASED → lot.released (worker partiyi RELEASED yapar, URT-06).
   */
  @Post("inspections/:id/release")
  @RequirePermission("quality", "APPROVE")
  @ApiZodBody(lotReleaseSchema)
  async release(
    @Param("id") id: string,
    @Body(new ZodPipe(lotReleaseSchema)) body: LotReleaseRequest,
    @CurrentUser() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const insp = await tx.qcInspection.findUnique({ where: { id }, include: { lot: { select: { id: true, qcStatus: true } }, results: true } });
      if (!insp) throw new NotFoundException({ message: "Muayene bulunamadı" });
      if (insp.status === "PASSED" || insp.lot.qcStatus === "RELEASED") return { id, status: "PASSED", lot: insp.lot.id };
      if (insp.status === "FAILED") throw new BadRequestException({ message: "Başarısız muayene serbest bırakılamaz; önce DÖF kapatılmalı" });
      const tests = await applicableTests(tx, insp.lot.id);
      const passed = new Set(insp.results.filter((r) => r.passed).map((r) => r.testId));
      const missing = tests.filter((t) => !passed.has(t.id));
      if (missing.length > 0)
        throw new BadRequestException({ message: `Tüm zorunlu testler geçmeden serbest bırakılamaz (KAL-02). Eksik/başarısız: ${missing.map((t) => t.code).join(", ")}` });
      await tx.qcInspection.update({ where: { id }, data: { status: "PASSED", releasedById: auth.userId, releasedAt: new Date() } });
      await setLotQcStatus(tx, { lotId: insp.lot.id, status: "RELEASED", reason: body.note ?? `Muayene ${id}: tüm testler geçti`, userId: auth.userId, ...clientInfo(req) });
      return { id, status: "PASSED", lot: insp.lot.id };
    });
  }

  /** DÖF listesi. */
  @Get("nonconformances")
  @RequirePermission("quality", "VIEW")
  async nonconformances(@Query("status") status?: string) {
    const rows = await this.prisma.nonConformance.findMany({ where: status ? { status: status as "OPEN" | "INVESTIGATING" | "ACTION" | "CLOSED" } : {}, orderBy: { createdAt: "desc" }, take: 100 });
    return rows.map((n) => ({ id: n.id, number: n.number, lotId: n.lotId, description: n.description, status: n.status, rootCause: n.rootCause, action: n.action, createdAt: n.createdAt.toISOString(), closedAt: n.closedAt?.toISOString() ?? null }));
  }

  /** DÖF açar (elle). */
  @Post("nonconformances")
  @RequirePermission("quality", "CREATE")
  @ApiZodBody(nonConformanceSchema)
  async createNc(@Body(new ZodPipe(nonConformanceSchema)) body: NonConformanceRequest, @CurrentUser() auth: AuthContext, @Req() req: AuthedRequest) {
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.nonConformance.count();
      const number = `NC-${new Date().getFullYear() % 100}${String(count + 1).padStart(4, "0")}`;
      const nc = await tx.nonConformance.create({ data: { number, lotId: body.lotId ?? null, description: body.description, ownerId: auth.userId } });
      await writeAudit(tx, { userId: auth.userId, action: "nc.create", entity: "NonConformance", entityId: nc.id, after: { number, lotId: body.lotId ?? null }, ...clientInfo(req) });
      return { id: nc.id, number };
    });
  }
}
