# Atelier ERP

Parfüm üreticisi için üretimden müşteriye uçtan uca işletim sistemi.

- **Tıklanabilir prototip:** `docs/06-tasarim-sistemi.md`
- **Claude Code ile çalışma kuralları:** `CLAUDE.md`

## Klasör yapısı

```
apps/
  web/         Yönetim paneli (Next.js)             — Faz 0'da oluşturulur
  api/         İş mantığı ve REST API (NestJS)      — Faz 0'da oluşturulur
  worker/      Arka plan işleri (BullMQ)            — Faz 0'da oluşturulur
  mobile/      Mobil depo uygulaması (Expo)         — Faz 3'te oluşturulur
packages/
  db/          Prisma şeması (veri modeli), istemci, stok servisi
  shared/      Vergi hesabı (testli), olay tipleri, ortak şemalar
  integrations/ Dış sistem adaptör arayüzü
docs/
  00-genel-bakis.md       Vizyon, modüller, roller
  01-mimari.md            Mimari ve kritik akışlar
  02-veri-modeli.md       Veri modeli, kararlar, olay listesi, tohum verisi
  03-moduller/            18 modül şartnamesi (iş kuralları, API, kabul kriterleri)
  04-entegrasyonlar.md    Entegrasyon listesi, öncelik, doğrulanacak yasal konular
  05-yol-haritasi.md      Fazlar, görevler, çıkış kriterleri
  06-tasarim-sistemi.md   Token'lar, bileşenler, prototip bağlantısı
  07-guvenlik-kvkk.md     Veri sınıfları, KVKK, güvenlik kontrol listesi
  karar-kayitlari/        Mimari karar kayıtları (ADR)
.claude/
  commands/    /faz /modul /entegrasyon /kontrol /durum
  agents/      mevzuat-denetcisi, veri-modeli-muhafizi, test-yazari
  settings.json İzinler (.env okuma ve git push kapalı)
```

## Claude Code ile başlangıç

1. Bu klasörü bir git deposu yapın: `git init && git add . && git commit -m "chore: project foundation"`.
2. Gereksinimleri kurun: Node 22, pnpm (`corepack enable`), Docker Desktop, Claude Code.
3. Klasörde `claude` komutunu çalıştırın ve ilk mesaj olarak şunu yazın:

   > CLAUDE.md ve docs klasörünü oku. Sonra `/faz 0` ile başla.

4. Faz 0'ın son görevi (F0-12) üç kararı size sorar:
   - Barındırma yeri.
   - e-Belge entegratörü.
   - Kendi web sitenizin altyapısı.

   Bu kararlar olmadan Faz 2 başlamaz.

İlerleme sorusu için `/durum`, her iş parçasından sonra `/kontrol` kullanın.

## Hazır olanlar
- `packages/db/prisma/schema.prisma`: 90+ tablo ve enum. Prisma şema doğrulamasından geçti.
- `packages/shared/src/tax.ts`: ÖTV + KDV hesabı, 7 birim testi geçiyor.
- Tüm modüllerin şartnameleri, olay sözleşmesi, entegrasyon planı ve yol haritası.

## Önemli uyarı
Vergi oranları, e-belge eşikleri ve kozmetik mevzuatı gibi yasal değerler sisteme parametre olarak girilir ve `docs/04-entegrasyonlar.md#dogrulanacaklar` listesinde teyit bekler. Canlıya çıkmadan önce mali müşavir ve ilgili uzmanlarla teyit edilmelidir.
