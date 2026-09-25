import path from "node:path";
import { config as loadEnv } from "dotenv";
import { type NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Ortam değişkenleri depo kökündeki .env'den okunur (bkz. scripts/setup-env.mjs).
loadEnv({ path: path.resolve(import.meta.dirname, "../../.env"), quiet: true });

const apiUrl = process.env.API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: { API_URL: apiUrl },
  // Tarayıcı API'ye aynı kökten (/api) gider; oturum çerezi web alan adında kalır.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
