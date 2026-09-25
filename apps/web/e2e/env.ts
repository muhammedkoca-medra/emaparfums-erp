import path from "node:path";
import { testDatabaseUrl } from "@atelier/db/testing";
import { config as loadEnv } from "dotenv";

/**
 * Tarayıcı testleri kendi veritabanı ve portlarıyla koşar; açık geliştirme ortamına dokunmaz.
 * API :4100, worker sağlık :4101, web :3100.
 */
loadEnv({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });

const base = process.env.DATABASE_URL_TEST;
if (!base) throw new Error("DATABASE_URL_TEST tanımlı değil (pnpm bootstrap)");

export const E2E = {
  databaseUrl: testDatabaseUrl(base, "e2e"),
  apiPort: 4100,
  workerHealthPort: 4101,
  webPort: 3100,
  stateFile: path.resolve(import.meta.dirname, ".state.json"),
};
export const webUrl = `http://localhost:${E2E.webPort}`;
export const apiUrl = `http://localhost:${E2E.apiPort}`;

export interface E2EState {
  admin: { email: string; password: string; fullName: string };
}
