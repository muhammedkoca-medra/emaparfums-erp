# apps/worker — Arka plan işleri (BullMQ)

- `outbox-dispatcher`: PENDING olayları okur, ilgili kuyruğa aktarır.
- Olay işleyicileri: `handlers/<olay>.ts` (docs/02-veri-modeli.md#olaylar tablosundaki "Dinleyen" sütunu).
- Zamanlanmış işler: pazaryeri sipariş çekme, stok/fiyat itme, kargo durum sorgusu, kur çekme, MRP gece hesabı, abonelik tahsilatı, SKT uyarısı.
- Her iş: tekrar deneme (üstel), ölü mektup kuyruğu, `IntegrationLog`.
