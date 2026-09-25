import { type Db } from "./client.js";

/**
 * IntegrationLog yazıcısı: `@atelier/integrations` içindeki IntegrationLogSink arayüzünün
 * veritabanı uygulaması. Gelen kayıtlar buildContext tarafından zaten maskelenmiştir.
 */
export function integrationLogSink(prisma: Db) {
  return {
    async write(entry: {
      integrationId: string;
      direction: "IN" | "OUT";
      operation: string;
      status: "OK" | "ERROR" | "RETRY";
      request?: unknown;
      response?: unknown;
      durationMs?: number;
    }): Promise<void> {
      await prisma.integrationLog.create({
        data: {
          integrationId: entry.integrationId,
          direction: entry.direction,
          operation: entry.operation,
          status: entry.status,
          request: (entry.request ?? undefined) as object | undefined,
          response: (entry.response ?? undefined) as object | undefined,
          durationMs: entry.durationMs ?? null,
        },
      });
    },
  };
}
