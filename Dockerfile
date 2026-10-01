# EMAPARFUMS ERP — tek imaj, çok servis (web / api / worker).
# Aynı imaj compose'ta farklı `command` ile çalışır. Prisma @prisma/adapter-pg kullandığı için
# çalışma zamanında native engine binary gerekmez; imaj sade kalır.
FROM node:22-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@12.6.0 --activate
WORKDIR /app
ENV NODE_ENV=production
# Next.js rewrite hedefi ve sunucu tarafı fetch tabanı derleme anında gömülür (iç ağ adresi).
ARG API_URL=http://api:4000
ENV API_URL=${API_URL}

# Bağımlılıklar (lockfile ile tekrarlanabilir). Build için devDependencies de gerekir.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json tsconfig.base.json eslint.config.mjs ./
COPY packages ./packages
COPY apps ./apps
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile

# Tüm paketleri ve uygulamaları derle (db: prisma generate + tsc, shared, integrations, api, worker, web).
RUN pnpm build

EXPOSE 3000 4000
# Varsayılan: web. Compose api/worker için override eder.
CMD ["pnpm","--filter","@atelier/web","start"]
