import { execSync } from "node:child_process";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import pg from "pg";

/**
 * e2e test veritabanını hazırlar: DATABASE_URL_TEST'teki veritabanı yoksa oluşturulur, şema
 * sıfırlanır ve migration'lar uygulanır. Geliştirme veritabanına (DATABASE_URL) dokunulmaz.
 * Not: AuditLog trigger'ı TRUNCATE'i engellediği için temizlik şemayı düşürerek yapılır.
 */
export default async function setup() {
  loadEnv({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST tanımlı değil (pnpm setup)");
  if (url === process.env.DATABASE_URL) throw new Error("DATABASE_URL_TEST, DATABASE_URL ile aynı olamaz");

  const target = new URL(url);
  const dbName = decodeURIComponent(target.pathname.slice(1));
  if (!/^[\w-]+$/.test(dbName)) throw new Error(`Geçersiz test veritabanı adı: ${dbName}`);

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (exists.rowCount === 0) await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  const db = new pg.Client({ connectionString: url });
  await db.connect();
  await db.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  await db.end();

  execSync("pnpm exec prisma migrate deploy", {
    cwd: path.resolve(import.meta.dirname, "../../../packages/db"),
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
