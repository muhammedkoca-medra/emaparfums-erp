/**
 * Tarayıcı testleri öncesi: e2e veritabanını sıfırdan migrate eder, rolleri ve yetki matrisini
 * tohumlar, rastgele parolalı bir yönetici oluşturur. Parolalar yalnızca .state.json'a yazılır
 * (git'e girmez) ve her çalıştırmada yenilenir.
 */
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { hash } from "@node-rs/argon2";
import { createPrismaClient } from "@atelier/db";
import { prepareTestDatabase } from "@atelier/db/testing";
import { defaultRolePermissions, ROLE_CODES, ROLE_NAMES } from "@atelier/shared";
import { E2E, type E2EState } from "./env.js";

await prepareTestDatabase(E2E.databaseUrl);
const prisma = createPrismaClient(E2E.databaseUrl);

const matrix = defaultRolePermissions();
const roleIds: Record<string, string> = {};
for (const code of ROLE_CODES) {
  const role = await prisma.role.create({ data: { code, name: ROLE_NAMES[code] } });
  roleIds[code] = role.id;
  await prisma.rolePermission.createMany({
    data: matrix[code].map((p) => ({ roleId: role.id, module: p.module, action: p.action })),
  });
}

const state: E2EState = {
  admin: {
    email: "admin@emaparfums.local",
    password: randomBytes(12).toString("base64url"),
    fullName: "Test Yönetici",
  },
};
await prisma.user.create({
  data: {
    email: state.admin.email,
    fullName: state.admin.fullName,
    passwordHash: await hash(state.admin.password, {
      algorithm: 2,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    }),
    roles: { create: [{ roleId: roleIds.ADMIN! }] },
  },
});
await prisma.$disconnect();
writeFileSync(E2E.stateFile, JSON.stringify(state));
console.log("e2e veritabanı hazır");
