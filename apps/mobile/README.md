# apps/mobile — Mobil depo (Expo / React Native)

Şartname: `docs/03-moduller/mobil-depo.md`. Faz 3'te oluşturulacak.

- Ekranlar: Görevler, Mal kabul, Toplama, Sayım (prototipte M1–M4).
- Barkod: `expo-camera` barkod tarama; el terminali (Zebra vb.) klavye kamaması da desteklenir.
- Çevrimdışı: işlemler yerel kuyrukta (SQLite), bağlantı gelince idempotent anahtarla gönderilir.
- Tartı: Bluetooth/USB tartı entegrasyonu sayım ekranında (Faz 4, cihaz modeline göre).
