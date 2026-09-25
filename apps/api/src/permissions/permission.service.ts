import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";

@Injectable()
export class PermissionService {
  constructor(private readonly prisma: PrismaService) {}

  /** Kullanıcının tüm rollerinden birleşik izin kümesi: "module:ACTION". */
  async forUser(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.rolePermission.findMany({
      where: { role: { users: { some: { userId } } } },
      select: { module: true, action: true },
    });
    return new Set(rows.map((r) => `${r.module}:${r.action}`));
  }
}
