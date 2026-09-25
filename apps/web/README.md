# apps/web — Yönetim paneli (Next.js)

Next.js (App Router) + Tailwind 4 + next-intl. Tarayıcı API'ye `/api/*` rewrite'ı üzerinden gider; oturum çerezi web alan adında kalır.

- Rotalar: `app/(app)/<modül>/` — modül adları `docs/03-moduller/` dosya adlarıyla aynı.
- Düzen: sol menü (prototipteki "Kenar menü") + üst bar. Menü grupları `docs/06-tasarim-sistemi.md`.
- Metinler: `messages/tr.json` (next-intl).
- Veri: `apps/api` REST uçları; tipler `packages/shared` zod şemalarından.
- Yetki: menü öğeleri ve butonlar kullanıcının `RolePermission` kayıtlarına göre gizlenir; asıl kontrol API'dedir.
