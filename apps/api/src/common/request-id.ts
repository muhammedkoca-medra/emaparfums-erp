import { randomUUID } from "node:crypto";
import { type NextFunction, type Request, type Response } from "express";
import { type Logger } from "pino";

/** Her isteğe kimlik verir (X-Request-Id), bitişte tek satır JSON log yazar. */
export function requestIdMiddleware(log: Logger) {
  return (req: Request & { id?: string }, res: Response, next: NextFunction) => {
    const incoming = req.header("x-request-id");
    req.id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader("x-request-id", req.id);
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      log.info(
        { requestId: req.id, method: req.method, path: req.path, status: res.statusCode, ms: Math.round(ms) },
        "istek",
      );
    });
    next();
  };
}
