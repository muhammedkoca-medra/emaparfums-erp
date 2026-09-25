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

**Kodlama notları** (`packages/shared/src/permissions.ts`, tablo ile birebir):
- **`dashboard`:** Tabloda yok. Kontrol paneli, mali müşavir dışındaki tüm iç rollere G olarak açıktır.
- **`receiving` (mal kabul):** Tablodaki "Depo · purchasing: G (kabul O)" hücresi ayrı izin koduna ayrıldı. Böylece depo mal kabul girebilir ama satın alma siparişi oluşturamaz. Satın alma ve depo rollerinde GO, diğer ilgili rollerde G.
- **`social / content`:** Tek satır iki izin koduna bölündü: `social`, `content`.
- **Tutar limitleri:** Satın alma onayı ≤ ₺50.000 gibi limitler `ApprovalRule` tablosundadır. Tohum kaydı: `purchasing / PurchaseOrder / 50.000 → ADMIN`.

**Erişim sınıfları (API):** Her uç tam olarak bir sınıf taşır:
- `@Public()`: sağlık kontrolü ve giriş
- `@Authenticated()`: oturumlu her kullanıcı, ör. `/auth/me`
- `@RequirePermission(module, action)`

Sınıfı olmayan uç varsayılan olarak reddedilir. `apps/api/test/permissions.e2e.test.ts` tüm uçları tarar.

## İş kuralları
- **YTK-01:** Yetki kontrolünün asıl yeri API'dir (`@RequirePermission`); arayüz yalnızca gizler.
- **YTK-02:** Yetki matrisindeki bir değişiklik, yönetici onayından sonra geçerli olur ve `AuditLog`'a yazılır.
- **YTK-03:** `AuditLog` yalnızca eklenir. Veritabanı trigger'ı UPDATE ve DELETE işlemlerini engeller; kayıtlar 10 yıl saklanır (süre parametrik ve teyit edilecek).
- **YTK-04:** İki adımlı doğrulama (TOTP) tüm kullanıcılar için zorunludur; ilk girişte kurulum ekranı açılır. Web oturumu 8 saattir (`SESSION_TTL_HOURS`). Art arda 5 hatalı parola hesabı 15 dakika kilitler (`LOGIN_MAX_FAILURES`, `LOGIN_LOCK_MINUTES`); giriş uçlarında IP başına dakikada 20 istek sınırı vardır. Yeni cihazdan giriş bildirilir. Dış kullanıcılar (mali müşavir) salt okunur ve IP kısıtlıdır (opsiyonel).
- **YTK-05:** `customer_pii` izni olmayan kullanıcı TCKN/VKN/telefon/e-postayı maskeli görür. Dışa aktarma her zaman loglanır.
- **YTK-06:** Onay akışı `ApprovalRule` ile tanımlanır: modül, varlık, tutar eşiği ve onaylayan rol.
- **YTK-07:** Mobil depo cihazları kullanıcıya bağlı cihaz token'ıyla girer; oturum 12 saat sürer.

## API uçları
- `GET|POST /admin/users`, `POST /admin/users/:id/roles`
- `GET /admin/roles/:id/permissions`, `POST /admin/permission-changes` (onaylı)
- `GET /admin/audit?entity&user&from&to`
- `GET|POST /admin/approval-rules`, `GET /approvals?mine`, `POST /approvals/:id/decide`

## Kabul kriterleri
- [x] Her API ucunun bir izin kodu var (otomatik test: izinsiz uç listesi boş). · F0-05
- [x] AuditLog'a UPDATE veya DELETE denemesi veritabanında başarısız oluyor (TRUNCATE da). · F0-02
- [ ] Maskeli görünüm ve dışa aktarma logu çalışıyor.
