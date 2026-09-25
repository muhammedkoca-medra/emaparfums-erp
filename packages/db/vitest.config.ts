import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    globalSetup: ["src/test-support/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      include: ["src/stock.ts", "src/settings.ts", "src/outbox.ts", "src/audit.ts"],
      thresholds: { "src/stock.ts": { lines: 90, branches: 85, functions: 90, statements: 90 } },
    },
  },
});
