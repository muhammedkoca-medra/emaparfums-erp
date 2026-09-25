# apps/api — İş mantığı ve REST API (NestJS)

Çalıştırma: `pnpm dev` (kökten) · Test: `pnpm --filter @atelier/api test` (ayrı test veritabanı) · Belgeler: http://localhost:4000/docs

- `src/modules/<modül>/` — controller, service, dto (zod), testler.
- `@RequirePermission(module, action)` dekoratörü + guard: `RolePermission` tablosu.
- `AuditInterceptor`: CLAUDE.md kural 7'deki varlıklarda önce/sonra kaydı.
- Outbox: servisler olayları `OutboxEvent`'e aynı transaction içinde yazar.
- OpenAPI: `/docs`.
- Webhook alıcıları: `src/webhooks/<entegrasyon>` — imza doğrulaması zorunlu.
