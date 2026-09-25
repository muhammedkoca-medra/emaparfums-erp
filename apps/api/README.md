# apps/api — İş mantığı ve REST API (NestJS)

Faz 0'da `nest new` ile oluşturulacak.

- `src/modules/<modül>/` — controller, service, dto (zod), testler.
- `@RequirePermission(module, action)` dekoratörü + guard: `RolePermission` tablosu.
- `AuditInterceptor`: CLAUDE.md kural 7'deki varlıklarda önce/sonra kaydı.
- Outbox: servisler olayları `OutboxEvent`'e aynı transaction içinde yazar.
- OpenAPI: `/docs`.
- Webhook alıcıları: `src/webhooks/<entegrasyon>` — imza doğrulaması zorunlu.
