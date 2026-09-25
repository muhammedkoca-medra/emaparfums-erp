import path from "node:path";
import { prepareTestDatabase } from "@atelier/db/testing";
import { config as loadEnv } from "dotenv";

/** e2e test veritabanı (DATABASE_URL_TEST) her çalıştırmada sıfırdan migrate edilir. */
export default async function setup() {
  loadEnv({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST tanımlı değil (pnpm bootstrap)");
  if (url === process.env.DATABASE_URL) throw new Error("DATABASE_URL_TEST, DATABASE_URL ile aynı olamaz");
  await prepareTestDatabase(url);
}
