import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { type Tx, writeAudit } from "@atelier/db";
import {
  type ApprovalDecisionRequest,
  approvalDecisionSchema,
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  type PermissionChangeRequest,
  permissionChangeSchema,
} from "@atelier/shared";
import { type AuthContext, type AuthedRequest, clientInfo, CurrentUser } from "../auth/auth-context.js";
import { ApiZodBody, ZodPipe } from "../common/zod.js";
import { RequirePermission } from "../permissions/decorators.js";
import { PrismaService } from "../prisma.service.js";

interface PermissionChangePayload {
  roleId: string;
  roleCode: string;
  module: string;
  action: string;
  grant: boolean;
}

const ENTITY = "RolePermission";

/**
 * Yetki matrisi (F1-09 · YTK-02): hücre değişikliği önce talep olur, yönetici onayıyla uygulanır.
 *  - Talep eden kendi talebini onaylayamaz; ancak onay yetkisi olan başka etkin kullanıcı yoksa
 *    kilitlenmeyi önlemek için kendi onayına izin verilir (kayda geçer).
 *  - Yönetici rolünün admin izinleri kaldırılamaz (kendini kilitleme koruması).
 */
@ApiTags("admin")
@Controller()
export class PermissionsAdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("admin/permission-matrix")
  @RequirePermission("admin", "VIEW")
  async matrix() {
    const roles = await this.prisma.role.findMany({
      orderBy: { code: "asc" },
      include: {
        permissions: { select: { module: true, action: true } },
        _count: { select: { users: true } },
      },
    });
    const pending = await this.prisma.approvalRequest.findMany({
      where: { entity: ENTITY, status: "PENDING" },
      select: { entityId: true },
    });
    return {
      modules: PERMISSION_MODULES,
      actions: PERMISSION_ACTIONS,
      pendingCells: pending.map((p) => p.entityId),
      roles: roles.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        userCount: r._count.users,
        permissions: r.permissions.map((p) => `${p.module}:${p.action}`).sort(),
      })),
    };
  }

  @Post("admin/permission-changes")
  @RequirePermission("admin", "EDIT")
  @ApiZodBody(permissionChangeSchema)
  async request(
    @Body(new ZodPipe(permissionChangeSchema)) body: PermissionChangeRequest,
    @CurrentUser() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findUnique({ where: { id: body.roleId } });
      if (!role) throw new NotFoundException({ message: "Rol bulunamadı" });
      if (role.code === "ADMIN" && body.module === "admin" && !body.grant) {
        throw new BadRequestException({ message: "Yönetici rolünün yönetim izinleri kaldırılamaz" });
      }
      const has = await tx.rolePermission.findUnique({
        where: { roleId_module_action: { roleId: role.id, module: body.module, action: body.action } },
      });
      if (Boolean(has) === body.grant) {
        throw new BadRequestException({
          message: body.grant ? "Rolde bu izin zaten var" : "Rolde bu izin zaten yok",
        });
      }
      const entityId = `${role.id}:${body.module}:${body.action}`;
      const open = await tx.approvalRequest.findFirst({
        where: { entity: ENTITY, entityId, status: "PENDING" },
      });
      if (open) throw new ConflictException({ message: "Bu hücre için bekleyen bir değişiklik talebi var" });
      const payload: PermissionChangePayload = {
        roleId: role.id,
        roleCode: role.code,
        module: body.module,
        action: body.action,
        grant: body.grant,
      };
      const ar = await tx.approvalRequest.create({
        data: {
          entity: ENTITY,
          entityId,
          requestedById: auth.userId,
          note: body.note ?? null,
          payload: payload as object,
        },
      });
      await writeAudit(tx, {
        userId: auth.userId,
        action: "permission.change.request",
        entity: "ApprovalRequest",
        entityId: ar.id,
        after: { ...payload, note: body.note ?? null },
        ...clientInfo(req),
      });
      return { id: ar.id, status: ar.status };
    });
  }

  /** Bekleyen onaylar (şimdilik yetki değişiklikleri; satın alma onayları Faz 2'de eklenir). */
  @Get("approvals")
  @RequirePermission("admin", "VIEW")
  async approvals() {
    const rows = await this.prisma.approvalRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.requestedById) } },
      select: { id: true, fullName: true },
    });
    const name = new Map(users.map((u) => [u.id, u.fullName]));
    return rows.map((r) => ({ ...r, requestedBy: name.get(r.requestedById) ?? null }));
  }

  @Post("approvals/:id/decide")
  @RequirePermission("admin", "APPROVE")
  @HttpCode(200)
  @ApiZodBody(approvalDecisionSchema)
  async decide(
    @Param("id") id: string,
    @Body(new ZodPipe(approvalDecisionSchema)) body: ApprovalDecisionRequest,
    @CurrentUser() auth: AuthContext,
    @Req() req: AuthedRequest,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM "ApprovalRequest" WHERE id = ${id} FOR UPDATE`;
      if (!rows[0]) throw new NotFoundException({ message: "Talep bulunamadı" });
      const ar = await tx.approvalRequest.findUniqueOrThrow({ where: { id } });
      if (ar.status !== "PENDING") throw new ConflictException({ message: "Talep zaten sonuçlanmış" });
      if (ar.entity !== ENTITY)
        throw new BadRequestException({ message: "Bu talep türü bu ekrandan onaylanamaz" });

      const selfApproval = ar.requestedById === auth.userId;
      if (selfApproval && (await otherApprovers(tx, auth.userId)) > 0) {
        throw new ForbiddenException({
          message: "Kendi talebinizi onaylayamazsınız; başka bir yönetici onaylamalı",
        });
      }

      const p = ar.payload as unknown as PermissionChangePayload;
      if (body.decision === "APPROVE") {
        const before = await rolePermissions(tx, p.roleId);
        if (p.grant) {
          await tx.rolePermission.upsert({
            where: {
              roleId_module_action: { roleId: p.roleId, module: p.module, action: p.action as never },
            },
            update: {},
            create: { roleId: p.roleId, module: p.module, action: p.action as never },
          });
        } else {
          await tx.rolePermission.deleteMany({
            where: { roleId: p.roleId, module: p.module, action: p.action as never },
          });
        }
        await writeAudit(tx, {
          userId: auth.userId,
          action: "permission.change",
          entity: "Role",
          entityId: p.roleId,
          before: { permissions: before },
          after: { permissions: await rolePermissions(tx, p.roleId), approvalId: id, selfApproval },
          ...clientInfo(req),
        });
      }
      await tx.approvalRequest.update({
        where: { id },
        data: {
          status: body.decision === "APPROVE" ? "APPROVED" : "REJECTED",
          decidedById: auth.userId,
          decidedAt: new Date(),
          ...(body.note ? { note: `${ar.note ? `${ar.note} · ` : ""}${body.note}` } : {}),
        },
      });
      await writeAudit(tx, {
        userId: auth.userId,
        action: body.decision === "APPROVE" ? "approval.approve" : "approval.reject",
        entity: "ApprovalRequest",
        entityId: id,
        before: { status: "PENDING" },
        after: {
          status: body.decision === "APPROVE" ? "APPROVED" : "REJECTED",
          note: body.note ?? null,
          selfApproval,
        },
        ...clientInfo(req),
      });
      return { id, status: body.decision === "APPROVE" ? "APPROVED" : "REJECTED", selfApproval };
    });
  }
}

async function rolePermissions(tx: Tx, roleId: string) {
  const rows = await tx.rolePermission.findMany({
    where: { roleId },
    select: { module: true, action: true },
  });
  return rows.map((r) => `${r.module}:${r.action}`).sort();
}

/** Onay yetkisi olan diğer etkin kullanıcı sayısı. */
async function otherApprovers(tx: Tx, userId: string) {
  return tx.user.count({
    where: {
      id: { not: userId },
      isActive: true,
      roles: { some: { role: { permissions: { some: { module: "admin", action: "APPROVE" } } } } },
    },
  });
}
