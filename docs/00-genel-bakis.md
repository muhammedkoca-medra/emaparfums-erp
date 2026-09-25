# 00 · Genel bakış

**EMA Parfums**, parfüm üreten bir işletmenin formülden müşteriye kadar tüm süreçlerini tek platformda yönetmesi için tasarlanmış bir işletim sistemidir.

## Hedefler

1. **Tek kayıt:** Ürün, lot ve müşteri bir kez girilir; tüm modüller aynı kaydı kullanır.
2. **Zincirleme otomasyon:**
   - Sipariş gelince ödeme doğrulanır, stok rezerve edilir, fatura kesilir, kargo etiketi üretilir.
   - Stok azalınca üretim ya da satın alma önerisi oluşur.
3. **Uyum:**
   - Vergi, e-belge, kozmetik mevzuatı ve KVKK sisteme gömülüdür.
   - Uyumsuz ürün satışa açılamaz.
4. **İzlenebilirlik:** Herhangi bir lotun hammaddeden müşteriye kadar geçmişi saniyeler içinde çıkarılabilir.
5. **Anlaşılırlık:** Her ekran bir soruya cevap verir: "Ne durumdayız, ne yapmam gerekiyor?"

## Modüller

Sol menüdeki sıra ile:

| Grup | Modül | Şartname |
|---|---|---|
| Genel | Kontrol paneli, Sistem haritası | `03-moduller/kontrol-paneli.md` |
| Operasyon | Üretim | `03-moduller/uretim.md` |
| | Stok takip | `03-moduller/stok.md` |
| | Satın alma | `03-moduller/satin-alma.md` |
| | Kalite & mevzuat | `03-moduller/kalite.md` |
| Ticaret | Satış & CRM | `03-moduller/satis.md` |
| | E-ticaret | `03-moduller/e-ticaret.md` |
| | Sadakat & abonelik | `03-moduller/sadakat.md` |
| Finans & Lojistik | Ödemeler | `03-moduller/odeme.md` |
| | Faturalandırma | `03-moduller/fatura.md` |
| | Vergi merkezi | `03-moduller/vergi.md` |
| | Maliyet | `03-moduller/maliyet.md` |
| | Kargo takip | `03-moduller/kargo.md` |
| Pazarlama & AI | Sosyal medya | `03-moduller/sosyal-medya.md` |
| | İçerik stüdyosu | `03-moduller/icerik-studyosu.md` |
| | Koku laboratuvarı | `03-moduller/koku-ai.md` |
| Yönetim | Yetki & kayıtlar | `03-moduller/yetki.md` |
| | Mobil depo | `03-moduller/mobil-depo.md` |

## Kullanıcılar ve roller

Yönetici, Üretim & Ar-Ge, Kalite, Depo, Satın alma, Satış & e-ticaret, Pazarlama, Muhasebe, Mali müşavir (dış, salt okunur).
Yetki matrisi `03-moduller/yetki.md` dosyasında.

## Kapsam dışı (şimdilik)

- **Çift kayıtlı genel muhasebe:** Mevcut muhasebe yazılımı kullanılmaya devam eder, EMA Parfums kayıtları oraya aktarır.
- **Bordro ve İK.**
- **Mağaza kasası (ÖKC):** Yalnızca entegrasyon olarak ele alınır.
