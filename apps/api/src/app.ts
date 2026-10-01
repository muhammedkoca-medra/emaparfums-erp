import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { type NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import { type Logger } from "pino";
import { AppModule } from "./app.module.js";
import { HttpExceptionFilter } from "./common/http-exception.filter.js";
import { requestIdMiddleware } from "./common/request-id.js";
import { type AppConfig } from "./config.js";
import { NestPinoLogger } from "./logger.js";
import { PrismaService } from "./prisma.service.js";

/** Uygulamayı kurar (main.ts ve e2e testler aynı kurulumu kullanır). */
export async function createApp(config: AppConfig, logger: Logger): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(config, logger), {
    logger: new NestPinoLogger(logger),
    bufferLogs: false,
    bodyParser: false,
  });
  // Gövde ayrıştırıcıları: ürün görselleri JSON içinde base64 data URL olarak geldiği için sınır yükseltilir.
  app.useBodyParser("json", { limit: "6mb" });
  app.useBodyParser("urlencoded", { extended: true, limit: "6mb" });
  app.set("trust proxy", "loopback");
  app.disable("x-powered-by");
  app.use(requestIdMiddleware(logger));
  app.use(cookieParser());
  app.enableCors({ origin: config.WEB_ORIGIN.split(",").map((s) => s.trim()), credentials: true });
  app.use((_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });
  app.useGlobalFilters(new HttpExceptionFilter(logger));
  app.enableShutdownHooks();

  const prisma = app.get(PrismaService);
  const close = app.close.bind(app);
  app.close = async () => {
    await close();
    await prisma.$disconnect();
  };

  // API belgeleri canlıda herkese açık olmasın (docs/07 §Sınırlar).
  if (config.NODE_ENV === "production") return app;
  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("EMA Parfums ERP API")
      .setDescription("Parfüm üreticisi için işletim sistemi — REST API")
      .setVersion("0.1.0")
      .addCookieAuth("atelier_session")
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup("docs", app, doc);
  return app;
}
