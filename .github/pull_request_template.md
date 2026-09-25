## Ne değişti?

<!-- Kısa açıklama. Görev kodu varsa ekleyin (ör. F1-03). -->

## Kontrol listesi

- [ ] `pnpm lint && pnpm typecheck && pnpm test` geçiyor
- [ ] Şema değiştiyse önce `docs/02-veri-modeli.md` güncellendi, migration adı İngilizce ve açıklayıcı
- [ ] Yeni API ucunda zod şeması, `@RequirePermission` ve en az bir e2e test var
- [ ] Yeni iş kuralının birim testi var
- [ ] Stok yalnızca `StockMovement` + `packages/db/src/stock.ts` ile değişiyor
- [ ] Vergi oranı koda yazılmadı (`TaxRule` + `packages/shared/src/tax.ts`)
- [ ] Para hesabında `number` yok (`Decimal`)
- [ ] Modüller arası tetikleme `OutboxEvent` ile; yeni olay `docs/02#olaylar` listesinde
- [ ] Formül, fiyat, vergi, yetki, lot durumu veya fatura değişikliği `AuditLog` yazıyor
- [ ] Arayüz metinleri `apps/web/messages/tr.json` içinde
- [ ] Kişisel veri loglarda maskeli; kart verisi hiçbir yerde yok
- [ ] Yasal bir değer gerekiyorsa parametreye bağlandı ve `docs/04#dogrulanacaklar` listesine eklendi
- [ ] `docs/05-yol-haritasi.md` ve ilgili modül şartnamesi güncellendi

## Test

<!-- Nasıl doğrulandı? -->
