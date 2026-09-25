import { type LoggerService } from "@nestjs/common";
import { maskDeep } from "@atelier/shared";
import { pino, type Logger } from "pino";

/** Yapılandırılmış (JSON) log; kişisel veri ve gizli değerler maskDeep ile maskelenir (docs/07). */
export function createLogger(level: string, pretty: boolean): Logger {
  return pino({
    level,
    base: { service: "api" },
    formatters: { log: (obj) => maskDeep(obj) },
    ...(pretty
      ? { transport: { target: "pino-pretty", options: { singleLine: true, translateTime: "HH:MM:ss" } } }
      : {}),
  });
}

export const LOGGER = Symbol("LOGGER");

/** Nest'in kendi loglarını da aynı JSON akışına yönlendirir. */
export class NestPinoLogger implements LoggerService {
  constructor(private readonly logger: Logger) {}
  log(message: unknown, context?: string) {
    this.logger.info({ context }, String(message));
  }
  error(message: unknown, trace?: string, context?: string) {
    this.logger.error({ context, trace }, String(message));
  }
  warn(message: unknown, context?: string) {
    this.logger.warn({ context }, String(message));
  }
  debug(message: unknown, context?: string) {
    this.logger.debug({ context }, String(message));
  }
  verbose(message: unknown, context?: string) {
    this.logger.trace({ context }, String(message));
  }
}
