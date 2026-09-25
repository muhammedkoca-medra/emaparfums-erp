# Kargo takip

**Faz:** 2 (2 firma) · 3 (tümü, iade) · **Prototip ekranı:** 13 · **İzin modülü kodu:** `shipping`

## Amaç
Her paket doğru firmayla, zamanında yola çıkar. Müşteri, sormadan bilgilendirilir.

## Ekranlar
- **KPI:** Bugün çıkacak, yolda, geciken, iade sürecinde, ortalama teslim süresi.
- **Firma kartları:** Bugünkü gönderi sayısı, zamanında teslim oranı.
- **Gönderiler tablosu:** Sipariş, alıcı ve il, firma, 5 adımlı ilerleme çubuğu, durum. Filtreler: Geciken, İade.
- **Gönderi detayı:** Zaman çizelgesi, müşteri bildirim kaydı, akıllı firma seçimi açıklaması, tehlikeli madde notu.
- **Toplu etiket basma.**

## Varlıklar
Carrier, Shipment, ShipmentEvent, ReturnRequest, DispatchNote.

## İş kuralları
- **KRG-01 · Firma seçimi:**
  - Pazaryeri siparişi kanalın anlaşmalı kargosuyla gider.
  - Diğer siparişlerde puan hesaplanır: fiyat (desi ve bölge tarifesi) %40, il bazında son 90 günlük zamanında teslim %35, hasar oranı %25.
  - Elle değiştirilebilir; değişiklik loglanır.
- **KRG-02 · Desi:** Ürün ambalaj ölçülerinden hesaplanır, koli önerisi yapılır.
- **KRG-03:** Durum güncellemesi webhook ile gelir, yoksa 2 saatte bir sorgulanır. Her yeni olay `ShipmentEvent` olarak yazılır.
- **KRG-04:** Tahmini teslim tarihi geçer ya da transfer merkezinde 24 saatten fazla beklenirse durum `DELAYED` olur. `shipment.delayed` yayınlanır ve müşteriye bildirim şablonu gönderilir (WhatsApp veya SMS; kanal müşteri tercihine göre, rıza varsa).
- **KRG-05:** Alkollü parfüm yurt dışına hava yoluyla gönderiliyorsa `isDangerousGoods = true` işaretlenir. UN1266 beyanı ve etiketi eklenir; hava taşımasını kabul etmeyen firma seçilemez. Kuralların güncelliği `04-entegrasyonlar.md#dogrulanacaklar` listesinde.
- **KRG-06:** İade talebinde iade kodu veya etiketi üretilir. Paket gelince kalite modülü hasar kontrolü yapar; sonuca göre stok girişi (RETURN hareketi, karantinada) veya fire yazılır.
- **KRG-07:** Kargo maliyeti gönderiye yazılır ve maliyet ile vergi anatomisine akar.

## Olaylar
- **Yayınlar:** `shipment.created`, `shipment.status_changed`, `shipment.delayed`
- **Dinler:** `stock.reserved` (gönderi taslağı), `return.requested`

## API uçları
- `GET /shipping/shipments?status`, `GET /shipping/shipments/:id`
- `POST /shipping/shipments/:id/label`, `POST /shipping/labels/bulk`
- `POST /webhooks/cargo/:carrier`
- `GET /shipping/carriers/performance`

## Kabul kriterleri
- [ ] Mock adaptörle etiket, takip ve teslim akışı uçtan uca çalışıyor.
- [ ] Gecikme kuralı ve müşteri bildirimi tetikleniyor.
- [ ] Tehlikeli madde işareti olan gönderi yalnızca uygun firmaya atanabiliyor.
