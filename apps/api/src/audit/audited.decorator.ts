import { SetMetadata } from "@nestjs/common";
import { type Db } from "@atelier/db";

export const AUDIT_KEY = "atelier:audit";

export interface AuditOptions {
  /** "user.create", "user.roles.change", "price.change" … */
  action: string;
  /** Prisma model adı: "User", "TaxRule" … */
  entity: string;
  /** Kayıt kimliğinin geldiği route parametresi. Yoksa (oluşturma) yanıttaki `id` kullanılır. */
  idParam?: string;
  /**
   * Önce/sonra görüntüsünü yükler. Verilmezse `prisma.<entity>.findUnique({ where: { id } })`.
   * İlişkili veriyi (ör. roller) kayda katmak için kullanılır.
   */
  load?: (prisma: Db, id: string) => Promise<unknown>;
}

/**
 * CLAUDE.md kural 7: formül, fiyat, vergi kuralı, yetki, lot durumu ve fatura değişiklikleri
 * AuditLog yazar. Bu dekoratör AuditInterceptor'ı tetikler: işlemden önce ve sonra kaydı okur.
 */
export const Audited = (options: AuditOptions) => SetMetadata(AUDIT_KEY, options);
