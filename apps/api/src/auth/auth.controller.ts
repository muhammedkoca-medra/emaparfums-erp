import { Body, Controller, Get, HttpCode, Post, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  type ChangePasswordRequest,
  changePasswordSchema,
  type DeviceTokenResponse,
  type LoginRequest,
  loginRequestSchema,
  type LoginResponse,
  type MeResponse,
  type MfaVerifyRequest,
  mfaVerifyRequestSchema,
} from "@atelier/shared";
import { type Response } from "express";
import { RateLimit } from "../common/rate-limit.js";
import { ApiZodBody, ZodPipe } from "../common/zod.js";
import { Authenticated, Public } from "../permissions/decorators.js";
import { PermissionService } from "../permissions/permission.service.js";
import { type AuthContext, type AuthedRequest, clientInfo, CurrentUser } from "./auth-context.js";
import { AuthService } from "./auth.service.js";
import { SESSION_COOKIE, SessionService } from "./session.service.js";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly permissions: PermissionService,
  ) {}

  @Post("login")
  @Public()
  @HttpCode(200)
  @RateLimit(20, 60_000)
  @ApiZodBody(loginRequestSchema)
  async login(
    @Body(new ZodPipe(loginRequestSchema)) body: LoginRequest,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const device = body.client === "device";
    const result = await this.auth.login(body.email, body.password, clientInfo(req), {
      kind: device ? "DEVICE" : "WEB",
      deviceName: body.deviceName,
    });
    if (result.status !== "SESSION") return result;
    // İki adımlı doğrulama kapalı (yerel geliştirme): oturum bu adımda açıldı.
    const { session } = result;
    if (device) return { status: "OK", token: session.token, expiresAt: session.expiresAt.toISOString() };
    res.cookie(SESSION_COOKIE, session.token, this.sessions.cookieOptions(session.expiresAt));
    return { status: "OK" };
  }

  /** Web: oturum çerezi yazılır. Cihaz: token gövdede döner (Authorization: Bearer). */
  @Post("mfa/verify")
  @Public()
  @HttpCode(200)
  @RateLimit(20, 60_000)
  @ApiZodBody(mfaVerifyRequestSchema)
  async verify(
    @Body(new ZodPipe(mfaVerifyRequestSchema)) body: MfaVerifyRequest,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true } | DeviceTokenResponse> {
    const session = await this.auth.verifyMfa({
      challenge: body.challenge,
      code: body.code,
      kind: body.client === "device" ? "DEVICE" : "WEB",
      deviceName: body.client === "device" ? body.deviceName : undefined,
      client: clientInfo(req),
    });
    if (body.client === "device") return { token: session.token, expiresAt: session.expiresAt.toISOString() };
    res.cookie(SESSION_COOKIE, session.token, this.sessions.cookieOptions(session.expiresAt));
    return { ok: true };
  }

  @Post("logout")
  @Authenticated()
  @HttpCode(200)
  async logout(
    @CurrentUser() auth: AuthContext,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    await this.auth.logout(auth.sessionId, auth.userId, clientInfo(req));
    res.clearCookie(SESSION_COOKIE, this.sessions.cookieOptions());
    return { ok: true };
  }

  /** Kendi parolasını değiştirme; mevcut oturum açık kalır, diğerleri kapanır. */
  @Post("password")
  @Authenticated()
  @HttpCode(200)
  @RateLimit(10, 60_000)
  @ApiZodBody(changePasswordSchema)
  changePassword(
    @CurrentUser() auth: AuthContext,
    @Body(new ZodPipe(changePasswordSchema)) body: ChangePasswordRequest,
    @Req() req: AuthedRequest,
  ) {
    return this.auth.changePassword({
      userId: auth.userId,
      sessionId: auth.sessionId,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
      client: clientInfo(req),
    });
  }

  @Get("me")
  @Authenticated()
  async me(@CurrentUser() auth: AuthContext): Promise<MeResponse> {
    const [user, perms] = await Promise.all([
      this.auth.me(auth.userId),
      this.permissions.forUser(auth.userId),
    ]);
    return { ...user, permissions: [...perms].sort() };
  }
}
