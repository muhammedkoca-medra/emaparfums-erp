---
description: Kod kalitesi ve proje kuralları kontrolü
---
1. `pnpm lint && pnpm typecheck && pnpm test` çalıştır ve sonucu özetle.
2. Değişen dosyalarda (`git diff main...HEAD`) şu kural ihlallerini ara ve listele:
   - `stockBalance.update`/`upsert` çağrısı `packages/db/src/stock.ts` dışında
   - sabit vergi oranı (`0.2`, `0.20`, `20` yüzde bağlamında) `packages/shared/src/tax.ts` testleri dışında
   - para hesabında `number` kullanımı
   - `docs/02-veri-modeli.md#olaylar` listesinde olmayan olay adı
   - formül/fiyat/vergi/yetki/lot/fatura değişikliğinde eksik `AuditLog`
   - arayüzde `messages/tr.json` dışında Türkçe metin
   - loglarda maskelenmemiş TCKN/VKN/telefon/e-posta
3. Her ihlal için dosya:satır ve önerilen düzeltmeyi ver. Düzeltmeyi kullanıcı onaylarsa uygula.
