import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

export function createPrismaClient(connectionString = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) throw new Error("DATABASE_URL tanımlı değil (pnpm bootstrap)");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/** Transaction içinde veya dışında kullanılabilen istemci tipi. */
export type Db = PrismaClient;
export type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;
