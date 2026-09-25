import path from "node:path";
import { config as loadEnv } from "dotenv";
import { testDatabaseUrl } from "../testing.js";

loadEnv({ path: path.resolve(import.meta.dirname, "../../../../.env"), quiet: true });

/** db paketi testleri kendi veritabanını kullanır (api/worker testleriyle paralel koşabilir). */
export function dbTestUrl(): string {
  const base = process.env.DATABASE_URL_TEST;
  if (!base) throw new Error("DATABASE_URL_TEST tanımlı değil (pnpm bootstrap)");
  return testDatabaseUrl(base, "db");
}
