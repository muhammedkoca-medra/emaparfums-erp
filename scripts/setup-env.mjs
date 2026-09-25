#!/usr/bin/env node
/**
 * Yerel geliştirme için .env dosyasını hazırlar.
 *  - .env yoksa .env.example kopyalanır.
 *  - Gerekli anahtarlardan eksik olanlar eklenir; gizli anahtarlar rastgele üretilir.
 *  - .env.example'da olmayan anahtarlar oraya boş/yer tutucu değerle eklenir.
 * Değerler ekrana yazılmaz, yalnızca anahtar adları raporlanır.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, copyFileSync, appendFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const envPath = path.join(root, ".env");
const examplePath = path.join(root, ".env.example");

const secret = () => randomBytes(32).toString("base64");

/** [anahtar, yerel varsayılan (fonksiyon = gizli, her kurulumda üretilir), .env.example değeri] */
const REQUIRED = [
  ["DATABASE_URL", "postgresql://atelier:atelier@localhost:5432/atelier", "postgresql://atelier:atelier@localhost:5432/atelier"],
  ["DATABASE_URL_TEST", "postgresql://atelier:atelier@localhost:5432/atelier_test", "postgresql://atelier:atelier@localhost:5432/atelier_test"],
  ["REDIS_URL", "redis://localhost:6379", "redis://localhost:6379"],
  ["API_PORT", "4000", "4000"],
  ["API_URL", "http://localhost:4000", "http://localhost:4000"],
  ["WEB_ORIGIN", "http://localhost:3000", "http://localhost:3000"],
  ["COOKIE_SECURE", "false", "false"],
  ["SESSION_TTL_HOURS", "8", "8"],
  ["DEVICE_SESSION_TTL_HOURS", "12", "12"],
  ["TOTP_ISSUER", "Atelier", "Atelier"],
  ["AUTH_SECRET", secret, ""],
  ["PII_ENC_KEYS", () => `k1:${secret()}`, ""],
  ["PII_ENC_ACTIVE_KEY", "k1", "k1"],
  ["PII_HASH_KEY", secret, ""],
  ["SEED_ADMIN_EMAIL", "admin@atelier.local", "admin@atelier.local"],
  ["SEED_ADMIN_PASSWORD", () => randomBytes(9).toString("base64url"), ""],
];

const keysIn = (file) =>
  new Set(
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=/)?.[1])
      .filter(Boolean),
  );

if (!existsSync(envPath)) {
  if (existsSync(examplePath)) copyFileSync(examplePath, envPath);
  else writeFileSync(envPath, "");
  console.log("• .env oluşturuldu");
}

// Boş değerli gizli anahtarları doldurmak için .env'deki boş anahtarları bul.
const envText = readFileSync(envPath, "utf8");
const emptyKeys = new Set(
  envText
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*$/)?.[1])
    .filter(Boolean),
);
const present = keysIn(envPath);

let updated = envText;
const added = [];
const filled = [];
for (const [key, def] of REQUIRED) {
  const value = typeof def === "function" ? def() : def;
  if (!present.has(key)) {
    updated += `${updated.endsWith("\n") || updated === "" ? "" : "\n"}${key}=${value}\n`;
    added.push(key);
  } else if (emptyKeys.has(key)) {
    updated = updated.replace(new RegExp(`^(\\s*${key}\\s*=)\\s*$`, "m"), `$1${value}`);
    filled.push(key);
  }
}
if (updated !== envText) writeFileSync(envPath, updated);

if (existsSync(examplePath)) {
  const exampleKeys = keysIn(examplePath);
  const missing = REQUIRED.filter(([k]) => !exampleKeys.has(k));
  if (missing.length) {
    appendFileSync(
      examplePath,
      `\n# --- scripts/setup-env.mjs tarafından eklendi (boş olanlar kurulumda üretilir) ---\n` +
        missing.map(([k, , ex]) => `${k}=${ex}`).join("\n") +
        "\n",
    );
    console.log(`• .env.example'a eklendi: ${missing.map(([k]) => k).join(", ")}`);
  }
}

if (added.length) console.log(`• .env'e eklendi: ${added.join(", ")}`);
if (filled.length) console.log(`• .env'de dolduruldu: ${filled.join(", ")}`);
if (!added.length && !filled.length) console.log("• .env güncel");
console.log("Yönetici parolası .env içindeki SEED_ADMIN_PASSWORD anahtarındadır.");
