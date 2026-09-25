import { execFileSync } from "node:child_process";
import path from "node:path";
import pg from "pg";

/**
 * Test veritabanı hazırlığı (yalnızca testler). Veritabanı yoksa oluşturur, şemayı düşürüp
 * migration'ları yeniden uygular. AuditLog trigger'ı TRUNCATE'i engellediği için temizlik
 * şemayı düşürerek yapılır. Geliştirme veritabanına karşı çağrılmasın diye ad "test" içermelidir.
 */
export async function prepareTestDatabase(url: string): Promise<void> {
  const target = new URL(url);
  const dbName = decodeURIComponent(target.pathname.slice(1));
  if (!/^[\w-]+$/.test(dbName)) throw new Error(`Geçersiz test veritabanı adı: ${dbName}`);
  if (!dbName.includes("test")) throw new Error(`Test veritabanı adı "test" içermeli: ${dbName}`);

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (exists.rowCount === 0) await admin.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.end();
  }

  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    await db.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  } finally {
    await db.end();
  }

  const pkgDir = path.resolve(import.meta.dirname, "..");
  const prismaBin = path.join(pkgDir, "node_modules", "prisma", "build", "index.js");
  execFileSync(process.execPath, [prismaBin, "migrate", "deploy"], {
    cwd: pkgDir,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}

/** Ana test URL'sinden uygulamaya özel test veritabanı URL'si türetir: atelier_test → atelier_test_worker. */
export function testDatabaseUrl(baseUrl: string, suffix: string): string {
  const u = new URL(baseUrl);
  u.pathname = `${u.pathname}_${suffix}`;
  return u.toString();
}
