import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import { type Request } from "express";

export interface AuthContext {
  userId: string;
  sessionId: string;
  kind: "WEB" | "DEVICE";
  /** "module:ACTION" anahtarları; PermissionGuard ilk ihtiyaçta doldurur. */
  permissions?: Set<string>;
}

export type AuthedRequest = Request & { id?: string; auth?: AuthContext };

/** Denetim ve oturum kayıtları için istemci bilgisi. */
export function clientInfo(req: Request): { ip: string | null; userAgent: string | null } {
  return { ip: req.ip ?? null, userAgent: req.header("user-agent")?.slice(0, 500) ?? null };
}

/** Controller parametresi: `@CurrentUser() auth: AuthContext`. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthContext => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!req.auth) throw new Error("CurrentUser yalnızca oturumlu uçlarda kullanılabilir");
  return req.auth;
});
