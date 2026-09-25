import { defineConfig, devices } from "@playwright/test";
import { apiUrl, E2E, webUrl } from "./e2e/env";

/**
 * Uçtan uca tarayıcı testleri: gerçek API + worker + web (üretim derlemesi), ayrı veritabanı.
 * Çalıştırma: kökten `pnpm test:e2e` (önce api/worker derlenir, veritabanı hazırlanır).
 * Windows'ta kurulu Microsoft Edge kullanılır (indirme gerekmez); CI'da Chromium.
 */
const serverEnv = {
  ...process.env,
  NODE_ENV: "test",
  DATABASE_URL: E2E.databaseUrl,
  COOKIE_SECURE: "false",
  MFA_REQUIRED: "false",
  LOG_LEVEL: "warn",
  TURBO_TELEMETRY_DISABLED: "1",
  NEXT_TELEMETRY_DISABLED: "1",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: webUrl,
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "masaüstü",
      use: {
        ...devices["Desktop Chrome"],
        ...(process.platform === "win32" && !process.env.CI ? { channel: "msedge" } : {}),
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: [
    {
      command: "node ../api/dist/main.js",
      url: `${apiUrl}/system/health`,
      env: { ...serverEnv, API_PORT: String(E2E.apiPort), WEB_ORIGIN: webUrl },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "node ../worker/dist/main.js",
      url: `http://localhost:${E2E.workerHealthPort}/health`,
      env: {
        ...serverEnv,
        WORKER_HEALTH_PORT: String(E2E.workerHealthPort),
        QUEUE_PREFIX: "atelier-e2e",
        OUTBOX_POLL_MS: "300",
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `pnpm exec next build && pnpm exec next start --port ${E2E.webPort}`,
      url: `${webUrl}/giris`,
      env: { ...serverEnv, NODE_ENV: "production", API_URL: apiUrl, NEXT_DIST_DIR: ".next-e2e" },
      reuseExistingServer: false,
      timeout: 240_000,
    },
  ],
});
