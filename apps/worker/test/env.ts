import path from "node:path";
import { testDatabaseUrl } from "@atelier/db/testing";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });

export function workerTestDbUrl(): string {
  const base = process.env.DATABASE_URL_TEST;
  if (!base) throw new Error("DATABASE_URL_TEST tanımlı değil (pnpm bootstrap)");
  return testDatabaseUrl(base, "worker");
}

export const redisUrl = () => process.env.REDIS_URL ?? "redis://localhost:6379";
