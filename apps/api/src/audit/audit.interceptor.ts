import { type CallHandler, type ExecutionContext, Inject, Injectable, type NestInterceptor } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { writeAudit } from "@atelier/db";
import { type Logger } from "pino";
import { from, lastValueFrom, type Observable } from "rxjs";
import { type AuthedRequest, clientInfo } from "../auth/auth-context.js";
import { LOGGER } from "../logger.js";
import { PrismaService } from "../prisma.service.js";
import { AUDIT_KEY, type AuditOptions } from "./audited.decorator.js";

/**
 * @Audited uçlarda kaydın önceki ve sonraki halini AuditLog'a yazar (F0-06).
 * Handler başarısız olursa kayıt yazılmaz. Denetim yazılamazsa istek hata döner:
 * değişiklik yapılmış ama izi yoksa bu sessizce geçilmemeli.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    @Inject(LOGGER) private readonly log: Logger,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.get<AuditOptions | undefined>(AUDIT_KEY, ctx.getHandler());
    if (!options) return next.handle();
    return from(this.run(ctx, next, options));
  }

  private async run(ctx: ExecutionContext, next: CallHandler, options: AuditOptions): Promise<unknown> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const paramId = options.idParam ? String(req.params[options.idParam]) : undefined;
    const before = paramId ? await this.load(options, paramId) : null;

    const result = await lastValueFrom(next.handle(), { defaultValue: undefined });

    const entityId = paramId ?? (result as { id?: unknown } | undefined)?.id;
    if (typeof entityId !== "string") {
      this.log.error({ action: options.action }, "denetim: kayıt kimliği bulunamadı");
      throw new Error(`Audited uç kimlik döndürmedi: ${options.action}`);
    }
    const after = await this.load(options, entityId);
    await writeAudit(this.prisma, {
      userId: req.auth?.userId ?? null,
      action: options.action,
      entity: options.entity,
      entityId,
      before,
      after,
      ...clientInfo(req),
    });
    return result;
  }

  private async load(options: AuditOptions, id: string): Promise<unknown> {
    if (options.load) return options.load(this.prisma, id);
    const delegateName = options.entity[0]!.toLowerCase() + options.entity.slice(1);
    const delegate = (this.prisma as unknown as Record<string, { findUnique?: (a: unknown) => Promise<unknown> }>)[
      delegateName
    ];
    if (!delegate?.findUnique) throw new Error(`Denetim: bilinmeyen varlık ${options.entity}`);
    return delegate.findUnique({ where: { id } });
  }
}
