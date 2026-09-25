import { type Tx } from "./client.js";

/**
 * Denetim kaydı (CLAUDE.md kural 7). AuditLog yalnızca eklenir; UPDATE/DELETE veritabanı
 * trigger'ı ile engellenir (migration: audit_log_append_only).
 * API'de çoğu durumda AuditInterceptor bunu otomatik çağırır; servis içinden elle de yazılabilir.
 */
export interface AuditEntry {
  userId?: string | null;
  action: string; // "role.assign", "price.change", "lot.quarantine"
  entity: string; // Prisma model adı
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

export async function writeAudit(tx: Tx, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({
    data: {
      userId: entry.userId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      before: toJson(entry.before),
      after: toJson(entry.after),
      ip: entry.ip ?? null,
      userAgent: entry.userAgent?.slice(0, 500) ?? null,
    },
  });
}

/** Decimal/Date/BigInt değerlerini JSON'a güvenle çevirir; parola hash'i gibi alanlar çıkarılır. */
const OMIT = new Set(["passwordHash", "totpSecretEnc", "tokenHash"]);
function toJson(value: unknown): object | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(
    JSON.stringify(value, (key, v) => {
      if (OMIT.has(key)) return undefined;
      if (typeof v === "bigint") return v.toString();
      return v;
    }),
  );
}
