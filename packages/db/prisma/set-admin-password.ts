/**
 * Yönetici parolası belirler/sıfırlar (canlıda ilk giriş ya da parola unutulunca).
 * Tohumdan farkı: mevcut kullanıcının parolasını da GÜNCELLER ve iki adımlı doğrulamayı
 * sıfırlar (ilk girişte yeni QR ile yeniden kurulur). Kilit/başarısız giriş sayacı da temizlenir.
 *
 * Kullanım (sunucuda, deploy klasöründe):
 *   docker compose -f docker-compose.prod.yml run --rm \
 *     -e SEED_ADMIN_EMAIL=ornek@firma.com -e SEED_ADMIN_PASSWORD='GucluParola123' \
 *     migrate pnpm db:set-admin
 */
import path from "node:path";
import { hash } from "@node-rs/argon2";
import { config } from "dotenv";
import { createPrismaClient } from "../src/index.js";

config({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });

const prisma = createPrismaClient();

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "").toLowerCase().trim();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "";
  if (!email) throw new Error("SEED_ADMIN_EMAIL tanımlı değil.");
  if (password.length < 10) throw new Error("SEED_ADMIN_PASSWORD en az 10 karakter olmalı.");

  const adminRole = await prisma.role.findUnique({ where: { code: "ADMIN" } });
  if (!adminRole) throw new Error("ADMIN rolü yok; önce 'pnpm db:seed' çalıştırın.");

  // argon2id (docs/07 §Uygulama güvenliği) — tohumla aynı parametreler.
  const passwordHash = await hash(password, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });

  const existing = await prisma.user.findUnique({ where: { email } });
  let userId: string;
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        twoFactorOn: false,
        totpSecretEnc: null,
        totpLastCounter: null,
        failedLoginCount: 0,
        lockedUntil: null,
        isActive: true,
      },
    });
    userId = existing.id;
    console.log(`Parola güncellendi: ${email}`);
  } else {
    const user = await prisma.user.create({
      data: { email, fullName: "Yönetici", passwordHash, twoFactorOn: false },
    });
    userId = user.id;
    console.log(`Yönetici oluşturuldu: ${email}`);
  }

  const hasRole = await prisma.userRole.findFirst({ where: { userId, roleId: adminRole.id } });
  if (!hasRole) await prisma.userRole.create({ data: { userId, roleId: adminRole.id } });

  console.log("Tamam. Bu e-posta ve parolayla giriş yapıp iki adımlı doğrulamayı (TOTP) yeniden kurabilirsiniz.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
