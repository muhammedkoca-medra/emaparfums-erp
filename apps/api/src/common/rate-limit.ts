import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { type Request } from "express";

/**
 * Basit sabit pencereli hız sınırı (docs/07 §Sınırlar: giriş ve herkese açık uçlar).
 * Tek API süreci için bellek içi; yatay ölçeklenince Redis'e taşınmalı.
 */
const KEY = "atelier:rate-limit";

export const RateLimit = (max: number, windowMs: number) => SetMetadata(KEY, { max, windowMs });

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const rule = this.reflector.get<{ max: number; windowMs: number } | undefined>(KEY, ctx.getHandler());
    if (!rule) return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    const key = `${req.ip}:${req.method}:${req.route?.path ?? req.path}`;
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + rule.windowMs });
      if (this.hits.size > 10_000) this.prune(now);
      return true;
    }
    entry.count++;
    if (entry.count > rule.max)
      throw new HttpException(
        { message: "Çok fazla deneme yapıldı, lütfen biraz bekleyin" },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    return true;
  }

  /** Testler için. */
  reset() {
    this.hits.clear();
  }

  private prune(now: number) {
    for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
  }
}
