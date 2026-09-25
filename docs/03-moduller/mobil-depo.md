# Mobil depo uygulaması

**Faz:** 3 · **Prototip ekranları:** M1–M4 · **İzin modülü kodu:** `stock` + `purchasing` (kabul)

## Amaç
Depoda kâğıt kullanılmaz. Mal kabul, toplama, sayım ve transfer barkodla ve hatasız yapılır.

## Ekranlar
- **M1 · Görevler:** Selamlama, çevrim içi durumu, büyük "Barkod okut" düğmesi, günlük istatistikler, atanan görevler (öncelik etiketiyle).
- **M2 · Mal kabul:**
  - Kamera ile okuma, okutulan/beklenen miktar ve ilerleme, raf önerisi.
  - Tedarikçi lotu ve üretim tarihi.
  - "Numune ayrıldı (AQL)" ve "Hasar/eksik (fotoğraf)" kutuları.
  - Karantinaya al / Kabulü tamamla.
- **M3 · Toplama:**
  - Dalga ilerlemesi ve kargo kesim saati geri sayımı.
  - Aktif kalem: lokasyon, adet, FEFO lotu, sepet dağılımı.
  - "Okut ve onayla", "Bulamadım"; sıradaki kalemler kısa rota sırasıyla.
- **M4 · Sayım:**
  - Kör sayım (sistemdeki miktar gösterilmez), tartı bağlantısı.
  - Artır/azalt; sayılanlar ve farkları.
  - "Sayımı gönder": farklar onaya düşer.

## Varlıklar
DeviceTask, PickWave, PickWaveLine, CycleCount, CycleCountLine, GoodsReceipt(+Line), Lot, StockMovement.

## İş kuralları
- **MOB-01:** Her işlem istemcide üretilen bir `idempotencyKey` taşır; sunucu aynı anahtarı ikinci kez işlemez.
- **MOB-02:** Çevrimdışıyken işlemler yerel SQLite kuyruğuna yazılır ve bağlantı gelince sırayla gönderilir. Çakışmada (ör. lot başka biri tarafından tüketildiyse) işlem "çözülmesi gereken" listesine düşer.
- **MOB-03:** Toplamada okutulan lot, önerilen FEFO lotundan farklıysa uyarı verilir. Farklı lot yalnızca sorumlu onayı ve gerekçeyle kabul edilir.
- **MOB-04:** Toplama rotası `Location.pickSequence` alanına göre sıralanır. Kısa yol optimizasyonu Faz 5'te yapılır.
- **MOB-05:** Toplama dalgası kargo kesim saatine göre oluşturulur (varsayılan 21:00). Kesimi kaçıracak siparişler ertesi dalgaya kaydırılır ve bildirilir.
- **MOB-06:** "Bulamadım" durumunda lokasyon için anında sayım görevi açılır ve sistem sıradaki FEFO lotunu önerir.
- **MOB-07:** Mal kabulde okutulan miktar beklenenden fazlaysa SAT-05 kuralı uygulanır. Hasar fotoğrafı S3'e yüklenir ve kabul satırına bağlanır.
- **MOB-08:** Tartı okuması cihazdan gelirse `fromScale = true` işaretlenir; elle girilen değer ayrıca işaretlenir.

## API uçları
Mobil uygulama, ayrı bir BFF katmanı olmadan API'nin `/mobile/*` uçlarını kullanır:
- `GET /mobile/tasks`, `POST /mobile/tasks/:id/start`
- `POST /mobile/receipts/:poId/scan`, `POST /mobile/receipts/:poId/complete`
- `GET /mobile/waves/:id/next`, `POST /mobile/waves/:id/pick`
- `POST /mobile/counts/:id/lines`, `POST /mobile/counts/:id/submit`
- `POST /mobile/sync`: çevrimdışı kuyruğun toplu gönderimi

## Kabul kriterleri
- [ ] Uçak modunda 20 işlem yapılıp bağlantı gelince hepsi bir kez işleniyor.
- [ ] Yanlış lot okutulunca uyarı çıkıyor.
- [ ] Android el terminalinde (klavye kaması) ve telefon kamerasında barkod okunuyor.
- [ ] Dokunma alanları en az 48 px; güneş altında okunabilir kontrast sağlanıyor.
