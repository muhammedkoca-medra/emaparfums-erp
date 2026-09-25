import {
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { type Db } from "@atelier/db";
import {
  type AuditQuery,
  auditQuerySchema,
  type CreateUserRequest,
  createUserSchema,
  type SetUserRolesRequest,
  setUserRolesSchema,
} from "@atelier/shared";
import { Audited } from "../audit/audited.decorator.js";
import { hashPassword } from "../auth/auth.service.js";
import { ApiZodBody, ApiZodQuery, ZodPipe } from "../common/zod.js";
import { RequirePermission } from "../permissions/decorators.js";
import { PrismaService } from "../prisma.service.js";

/** Denetim görüntüsü: kullanıcı + rol kodları (parola hash'i ve TOTP sırrı hariç). */
const loadUserWithRoles = (prisma: Db, id: string) =>
  prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      fullName: true,
      isActive: true,
      isExternal: true,
      roles: { select: { role: { select: { code: true } } }, orderBy: { role: { code: "asc" } } },
    },
  });

/** Yetki & kayıtlar (docs/03-moduller/yetki.md §API uçları). */
@ApiTags("admin")
@Controller("admin")
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("users")
  @RequirePermission("admin", "VIEW")
  async users() {
    const users = await this.prisma.user.findMany({
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        email: true,
        fullName: true,
        isActive: true,
        isExternal: true,
        twoFactorOn: true,
        lastLoginAt: true,
        roles: { select: { role: { select: { code: true, name: true } } } },
      },
    });
    return users.map((u) => ({ ...u, roles: u.roles.map((r) => r.role) }));
  }

  @Post("users")
  @RequirePermission("admin", "CREATE")
  @Audited({ action: "user.create", entity: "User", load: loadUserWithRoles })
  @ApiZodBody(createUserSchema)
  async createUser(@Body(new ZodPipe(createUserSchema)) body: CreateUserRequest) {
    const exists = await this.prisma.user.findUnique({ where: { email: body.email }, select: { id: true } });
    if (exists) throw new ConflictException({ message: "Bu e-posta ile kayıtlı bir kullanıcı var" });
    const roles = await this.prisma.role.findMany({
      where: { code: { in: body.roleCodes } },
      select: { id: true },
    });
    const user = await this.prisma.user.create({
      data: {
        email: body.email,
        fullName: body.fullName,
        isExternal: body.isExternal,
        passwordHash: await hashPassword(body.password),
        roles: { create: roles.map((r) => ({ roleId: r.id })) },
      },
      select: { id: true, email: true, fullName: true },
    });
    return user;
  }

  /** Rol ataması bir yetki değişikliğidir: önce/sonra rol listesi AuditLog'a yazılır. */
  @Post("users/:id/roles")
  @RequirePermission("admin", "EDIT")
  @Audited({ action: "user.roles.change", entity: "User", idParam: "id", load: loadUserWithRoles })
  @ApiZodBody(setUserRolesSchema)
  async setRoles(@Param("id") id: string, @Body(new ZodPipe(setUserRolesSchema)) body: SetUserRolesRequest) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) throw new NotFoundException({ message: "Kullanıcı bulunamadı" });
    const roles = await this.prisma.role.findMany({
      where: { code: { in: body.roleCodes } },
      select: { id: true },
    });
    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId: id } }),
      this.prisma.userRole.createMany({ data: roles.map((r) => ({ userId: id, roleId: r.id })) }),
    ]);
    return { id, roleCodes: body.roleCodes };
  }

  @Get("roles")
  @RequirePermission("admin", "VIEW")
  async roles() {
    const roles = await this.prisma.role.findMany({
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, _count: { select: { users: true } } },
    });
    return roles.map(({ _count, ...r }) => ({ ...r, userCount: _count.users }));
  }

  @Get("roles/:id/permissions")
  @RequirePermission("admin", "VIEW")
  async rolePermissions(@Param("id") id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        name: true,
        permissions: {
          select: { module: true, action: true },
          orderBy: [{ module: "asc" }, { action: "asc" }],
        },
      },
    });
    if (!role) throw new NotFoundException({ message: "Rol bulunamadı" });
    return role;
  }

  /** İşlem geçmişi: zaman, kullanıcı, işlem, önceki → sonraki değer. En yeni kayıt önce. */
  @Get("audit")
  @RequirePermission("admin", "VIEW")
  @ApiZodQuery(auditQuerySchema)
  async audit(@Query(new ZodPipe(auditQuerySchema)) q: AuditQuery) {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        entity: q.entity,
        entityId: q.entityId,
        userId: q.userId,
        action: q.action ? { startsWith: q.action } : undefined,
        createdAt: q.from || q.to ? { gte: q.from, lte: q.to } : undefined,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: { user: { select: { id: true, fullName: true } } },
    });
    const hasMore = rows.length > q.limit;
    const items = hasMore ? rows.slice(0, q.limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
  }
}
