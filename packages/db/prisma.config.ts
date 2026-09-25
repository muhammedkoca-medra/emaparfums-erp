import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// .env depo kökünde durur (bkz. scripts/setup-env.mjs).
config({ path: path.resolve(import.meta.dirname, "../../.env"), quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  // generate/validate veritabanı istemez; migrate komutları DATABASE_URL ister.
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
