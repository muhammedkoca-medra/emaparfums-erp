# apps/web — Yönetim paneli (Next.js)

Faz 0'da `pnpm create next-app` ile oluşturulacak (App Router, TypeScript, Tailwind, ESLint).

- Rotalar: `app/(app)/<modül>/` — modül adları `docs/03-moduller/` dosya adlarıyla aynı.
- Düzen: sol menü (prototipteki "Kenar menü") + üst bar. Menü grupları `docs/06-tasarim-sistemi.md`.
- Metinler: `messages/tr.json` (next-intl).
- Veri: `apps/api` REST uçları; tipler `packages/shared` zod şemalarından.
- Yetki: menü öğeleri ve butonlar kullanıcının `RolePermission` kayıtlarına göre gizlenir; asıl kontrol API'dedir.
