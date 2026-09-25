import path from "node:path";
import { config as loadEnv } from "dotenv";
import { type NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Ortam değişkenleri depo kökündeki .env'den okunur (bkz. scripts/setup-env.mjs).
loadEnv({ path: path.resolve(import.meta.dirname, "../../.env"), quiet: true });

const apiUrl = process.env.API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Tarayıcı testleri ayrı klasöre derler; açık geliştirme sunucusuyla çakışmaz.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  poweredByHeader: false,
  env: { API_URL: apiUrl },
  // Tarayıcı API'ye aynı kökten (/api) gider; oturum çerezi web alan adında kalır.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/:path*` }];
  },
  async headers() {
    // CSP yalnızca üretimde (geliştirme sunucusu HMR için eval kullanır). docs/07 §Sınırlar.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          ...(process.env.NODE_ENV === "production" ? [{ key: "Content-Security-Policy", value: csp }] : []),
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
