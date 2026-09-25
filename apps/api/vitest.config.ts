import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// NestJS DI, decorator metadata ister; esbuild bunu üretmediği için testler SWC ile derlenir.
export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    // e2e testleri aynı test veritabanını kullanır; dosyalar sırayla çalışır.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
