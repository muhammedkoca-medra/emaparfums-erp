# Yetki & işlem kayıtları

**Faz:** 0 (temel) · 1 (matris) · **Prototip ekranı:** 17 · **İzin modülü kodu:** `admin`

## Amaç
Herkes yalnızca işini görür. Kim neyi değiştirdi her zaman bilinir, geri alınamaz biçimde kayıtlıdır.

## Ekranlar
- **Roller listesi:** Rol adı ve kullanıcı sayısı.
- **Yetki matrisi:** Modül × (Görüntüle, Oluştur, Düzenle, Onayla, Sil) ve onay limiti. Hücreye tıklayınca değişiklik talebi oluşur.
- **İşlem geçmişi:** Zaman, kullanıcı ve rol, işlem, önceki → sonraki değer, etiket.
- **Güvenlik & KVKK:** İki adımlı doğrulama, oturum süresi, dışa aktarma kuralları, rıza kayıtları, silme talepleri, yedekleme.

## Varsayılan yetki matrisi

Kısaltmalar: G = görüntüle, O = oluştur, D = düzenle, On = onayla, S = sil.

| Modül | Yönetici | Üretim/Ar-Ge | Kalite | Depo | Satın alma | Satış/E-tic | Pazarlama | Muhasebe | Mali müşavir |
|---|---|---|---|---|---|---|---|---|---|
| production | GODOnS | GOD (On: formül) | G | G | G | – | – | G | – |
| stock | GODOnS | G | G | GOD | GO | G | – | G | G |
| purchasing | GODOnS | G | G | G (kabul O) | GOD (On ≤ ₺50.000) | – | – | G | G |
| quality | GODOnS | G | GODOn | G | G | G | G | – | – |
| sales | GODOnS | – | – | G | – | GOD | G | G | G |
| ecommerce | GODOnS | – | – | – | – | GOD | G | – | – |
| invoicing | GODOnS | – | – | – | G (alış eşleştirme) | G | – | GODOn | G |
| tax | GODOn | – | – | – | – | – | – | GD | GOn |
| costing | GODOn | G | – | – | G | – | – | GOD | G |
| payments | GODOnS | – | – | – | – | G | – | GOD | G |
| shipping | GODOnS | – | – | GOD | – | GOD | – | G | – |
| loyalty | GODOnS | – | – | – | – | GOD | GOD | G | – |
| social / content | GODOnS | – | – | – | – | G | GOD (On: yayın) | – | – |
| scent | GODOnS | GOD | G | – | – | G | G | – | – |
| admin | GODOnS | – | – | – | – | – | – | – | – |
| customer_pii | G (maskeli dışa aktarma) | – | – | – | – | G | – | G | – |

## İş kuralları
- **YTK-01:** Yetki kontrolünün asıl yeri API'dir (`@RequirePermission`); arayüz yalnızca gizler.
- **YTK-02:** Yetki matrisindeki bir değişiklik, yönetici onayından sonra geçerli olur ve `AuditLog`'a yazılır.
- **YTK-03:** `AuditLog` yalnızca eklenir. Veritabanı trigger'ı UPDATE ve DELETE işlemlerini engeller; kayıtlar 10 yıl saklanır (süre parametrik ve teyit edilecek).
- **YTK-04:** İki adımlı doğrulama tüm kullanıcılar için zorunludur. Yeni cihazdan giriş bildirilir. Dış kullanıcılar (mali müşavir) salt okunur ve IP kısıtlıdır (opsiyonel).
- **YTK-05:** `customer_pii` izni olmayan kullanıcı TCKN/VKN/telefon/e-postayı maskeli görür. Dışa aktarma her zaman loglanır.
- **YTK-06:** Onay akışı `ApprovalRule` ile tanımlanır: modül, varlık, tutar eşiği ve onaylayan rol.
- **YTK-07:** Mobil depo cihazları kullanıcıya bağlı cihaz token'ıyla girer; oturum 12 saat sürer.

## API uçları
- `GET|POST /admin/users`, `POST /admin/users/:id/roles`
- `GET /admin/roles/:id/permissions`, `POST /admin/permission-changes` (onaylı)
- `GET /admin/audit?entity&user&from&to`
- `GET|POST /admin/approval-rules`, `GET /approvals?mine`, `POST /approvals/:id/decide`

## Kabul kriterleri
- [ ] Her API ucunun bir izin kodu var (otomatik test: izinsiz uç listesi boş).
- [ ] AuditLog'a UPDATE veya DELETE denemesi veritabanında başarısız oluyor.
- [ ] Maskeli görünüm ve dışa aktarma logu çalışıyor.
