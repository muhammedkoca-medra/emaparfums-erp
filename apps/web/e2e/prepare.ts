/**
 * Tarayıcı testleri öncesi: e2e veritabanını sıfırdan migrate eder, rolleri ve yetki matrisini
 * tohumlar, rastgele parolalı bir yönetici oluşturur. Parolalar yalnızca .state.json'a yazılır
 * (git'e girmez) ve her çalıştırmada yenilenir.
 */
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { hash } from "@node-rs/argon2";
import { createLot, createPrismaClient, recordMovement, reserveFefo } from "@atelier/db";
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
// Stok: prototip stok tablosundan kesit (depolar, kalemler, lotlar, rezervasyonlar)
const ana = await prisma.warehouse.create({ data: { code: "ANA", name: "Ana depo" } });
const soguk = await prisma.warehouse.create({ data: { code: "SOGUK", name: "Soğuk oda (12–15°C)" } });
const loc = async (warehouseId: string, code: string, seq: number, t?: [string, string]) =>
  (
    await prisma.location.create({
      data: { warehouseId, code, pickSequence: seq, tempMinC: t?.[0] ?? null, tempMaxC: t?.[1] ?? null },
    })
  ).id;
const locs = {
  B4: await loc(ana.id, "B4-02", 1),
  D2: await loc(ana.id, "D2-01", 2),
  A1: await loc(soguk.id, "A1-01", 3, ["12", "15"]),
};
const stock: [
  string,
  string,
  "RAW_MATERIAL" | "PACKAGING" | "FINISHED_GOOD",
  "KG" | "PCS",
  string,
  string,
  string | null,
  keyof typeof locs,
  string,
  string,
][] = [
  ["HM-0104", "Bergamot esansı (FCF)", "RAW_MATERIAL", "KG", "8", "L-2607-C", "2028-07-10", "A1", "6.2", "4"],
  ["AM-0510", "Cam şişe 50 ml (flakon)", "PACKAGING", "PCS", "2000", "L-2605-D", null, "B4", "1120", "1000"],
  [
    "MM-1011",
    "Velvet Iris EDP 100 ml",
    "FINISHED_GOOD",
    "PCS",
    "150",
    "L-2511-C",
    "2026-12-10",
    "D2",
    "462",
    "38",
  ],
];
for (const [code, name, type, uom, min, lotNo, expiry, l, qty, reserved] of stock) {
  const item = await prisma.item.create({ data: { code, name, type, uom, minStock: min } });
  await prisma.$transaction(async (tx) => {
    const lot = await createLot(tx, {
      itemId: item.id,
      lotNo,
      expiryDate: expiry ? new Date(expiry) : null,
      qcStatus: "RELEASED",
    });
    await recordMovement(tx, { type: "RECEIPT", itemId: item.id, lotId: lot.id, qty, toLocationId: locs[l] });
    await reserveFefo(tx, { itemId: item.id, qty: reserved, refType: "Manual", refId: "e2e" });
  });
}
await prisma.item.create({
  data: { code: "MM-1003", name: "Noir Ambré EDP 50 ml", type: "FINISHED_GOOD", uom: "PCS", minStock: "300" },
});

await prisma.$disconnect();
writeFileSync(E2E.stateFile, JSON.stringify(state));
console.log("e2e veritabanı hazır");
