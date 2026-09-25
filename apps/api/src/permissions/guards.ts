import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { type AuthedRequest } from "../auth/auth-context.js";
import { SESSION_COOKIE, SessionService } from "../auth/session.service.js";
import { ACCESS_KEY, type AccessRule } from "./decorators.js";
import { PermissionService } from "./permission.service.js";

const accessRule = (reflector: Reflector, ctx: ExecutionContext) =>
  reflector.getAllAndOverride<AccessRule | undefined>(ACCESS_KEY, [ctx.getHandler(), ctx.getClass()]);

/** 1. guard: oturumu çözer (web çerezi veya mobil cihaz için Bearer token). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const rule = accessRule(this.reflector, ctx);
    if (rule?.kind === "public") return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const bearer = req.header("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
    const token = bearer ?? (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    if (!token) throw new UnauthorizedException();

    const session = await this.sessions.resolve(token);
    if (!session)
      throw new UnauthorizedException({ message: "Oturumunuzun süresi doldu, lütfen tekrar giriş yapın" });
    req.auth = session;
    return true;
  }
}

/**
 * 2. guard: @RequirePermission kontrolü (YTK-01). Erişim sınıfı tanımlanmamış uç varsayılan
 * olarak REDDEDİLİR; böylece dekoratör unutulursa uç açık kalmaz.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const rule = accessRule(this.reflector, ctx);
    if (!rule) throw new ForbiddenException({ message: "Bu uç için erişim kuralı tanımlanmamış" });
    if (rule.kind === "public" || rule.kind === "authenticated") return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.auth) throw new UnauthorizedException();
    req.auth.permissions ??= await this.permissions.forUser(req.auth.userId);
    if (!req.auth.permissions.has(`${rule.module}:${rule.action}`)) throw new ForbiddenException();
    return true;
  }
}
