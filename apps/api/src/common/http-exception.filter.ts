import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import { type Request, type Response } from "express";
import { type Logger } from "pino";

/** Kullanıcıya görünen hata metinleri Türkçe (CLAUDE.md kural 1). */
const DEFAULT_MESSAGES: Record<number, string> = {
  400: "İstek geçersiz",
  401: "Oturum açmanız gerekiyor",
  403: "Bu işlem için yetkiniz yok",
  404: "Kayıt bulunamadı",
  409: "Kayıt çakışması",
  423: "Hesap geçici olarak kilitlendi",
  429: "Çok fazla deneme yapıldı, lütfen biraz bekleyin",
  500: "Beklenmeyen bir hata oluştu",
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly log: Logger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception instanceof HttpException ? exception.getResponse() : undefined;

    let message = DEFAULT_MESSAGES[status] ?? DEFAULT_MESSAGES[500]!;
    let extra: Record<string, unknown> = {};
    // Kendi hatalarımız { message: "Türkçe metin", ... } gövdesiyle fırlatılır. Nest'in kendi ürettiği
    // İngilizce gövdeler ({ statusCode, message[, error] }) gösterilmez, yerine Türkçe varsayılan döner.
    if (body && typeof body === "object" && typeof (body as { message?: unknown }).message === "string") {
      const { message: m, ...rest } = body as Record<string, unknown>;
      if (!("statusCode" in rest) && !("error" in rest)) {
        message = m as string;
        extra = rest;
      }
    }

    if (status >= 500) {
      this.log.error({ err: exception, requestId: req.id, path: req.path }, "istek hatası");
    }
    res.status(status).json({ statusCode: status, message, requestId: req.id, ...extra });
  }
}
