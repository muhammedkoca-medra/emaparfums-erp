# Koku laboratuvarı (AI)

**Faz:** 5 · **Prototip ekranı:** 10 · **İzin modülü kodu:** `scent`

## Amaç
Koku analizi, benzer koku bulma ve kişiye özel öneri yapar. Satışı artırır, iadeyi azaltır, Ar-Ge'ye de fikir verir.

## Ekranlar
1. **Koku analizi:**
   - Formülden türetilen üst, orta ve alt notalardan oluşan koku piramidi.
   - Akor radar grafiği (amber, odunsu, baharatlı, çiçeksi, taze, tatlı).
   - Kalıcılık (tahmin), yayılım, mevsim, kullanım zamanı.
2. **Benzer koku bul:**
   - Serbest metin veya ürün seçimi; filtreler: kendi kataloğum, stoktakiler, yeni formül önerisi.
   - Sonuçlar benzerlik yüzdesi ve ortak notalarla listelenir.
   - Katalogda karşılığı zayıf aramalar Ar-Ge'ye iletilir.
3. **Kişiye özel öneri:**
   - 8 soruluk test sonucu: sevdikleri, sevmedikleri, kullanım, mevsim, beklenti.
   - İlk 3 öneri (uyum yüzdesiyle), "Numune seti oluştur", "Profili CRM'e kaydet".

## Varlıklar
ScentNote, ProductNote, ProductAccord, Product.embedding, ScentQuizResult, Recommendation, ScentSearchLog.

## Veri kaynakları (karar · 25 Eylül 2026)
- **Kendi kataloğumuz:** Nota piramidi, akor skorları ve koku ailesi ürün kartında girilir; benzerlik analizi bu veriyle yapılır.
- **Referans kokular (rakip / ilham):** Fragrantica gibi kaynaklardan **parfüm bazında, elle** alınır. Yalnızca olgusal bilgi alınır: notalar, akorlar, koku ailesi, yıl, parfümör. Kaynak adresi kaydedilir ve kullanıcı onaylar.
- **Yasak:** Otomatik toplu veri çekme (kazıyıcı, crawler), sitenin bot korumasını aşma, açıklama metni, görsel ve kullanıcı yorumu kopyalama. Gerekçe: site otomatik erişimi engelliyor; içerik ve veritabanı telif ve FSEK kapsamında korunuyor.
- **Türkçe terimler:** Nota adları tek sözlükten gelir: `packages/shared/src/scent-notes.ts`. Serbest çeviri yapılmaz; sözlükte olmayan nota eklenirken İngilizce karşılığı yazılır.
- **İçerik:** Ürün açıklamaları kendi marka dilimizle yazılır (İçerik stüdyosu, Faz 4). Görseller kendi çekimlerimizdir.

## İş kuralları
- **KOK-01:**
  - Akor skorları ilk olarak formül satırlarındaki hammaddelerin koku ailesi ağırlıklarından hesaplanır.
  - Panel testi girildiğinde panel sonucu önceliklidir (`source = panel`).
  - Değerler arayüzde "tahmin" olarak etiketlenir.
- **KOK-02:** Ürün vektörü akor skorları, nota varlığı (ağırlıklı) ve metin açıklamasının gömme vektöründen oluşur. Benzerlik kosinüs ile hesaplanır ve `product.updated` olayında yeniden üretilir.
- **KOK-03:**
  - Serbest metin araması, Claude API ile yapılandırılmış profile çevrilir (akor ağırlıkları, istenen/istenmeyen notalar), sonra vektör aramasına girer.
  - Açıklama cümlesi sadece gerçek ortak notalardan üretilir.
- **KOK-04:** Sonuçlar yalnızca kendi katalogdur. Başka markaların ürünlerine "muadil" veya "benzeri" iddiası üretilmez (marka hakları ve haksız rekabet riski). Referans bir parfüm adı yazılırsa yalnızca kullanıcının tarif ettiği nota profiline dönüştürülür.
- **KOK-05:** Test sonucu müşteri kimliği varsa ve KVKK rızası alınmışsa CRM'e yazılır, yoksa anonim tutulur. `quiz.completed` yayınlanır.
- **KOK-06:** Öneride stokta olmayan veya `SALES_LOCKED` ürün önerilmez.
- **KOK-07:** En iyi skor eşiğin altındaysa (varsayılan 0,6) arama `ScentSearchLog` tablosuna "karşılanmayan talep" olarak düşer ve aylık Ar-Ge raporuna girer.

## Olaylar
- **Yayınlar:** `quiz.completed`
- **Dinler:** `product.updated`, `compliance.changed`

## API uçları
- `GET /scent/products/:id/analysis`
- `POST /scent/similar` `{ text? , productId?, filters }`
- `POST /scent/quiz`: cevaplar → profil ve öneriler (web sitesi ve tablet için herkese açık uç, hız sınırlı)
- `GET /scent/unmet-demand?period`

## Kabul kriterleri
- [ ] Prototipteki örnek (Noir Ambré için %92 benzerlik sırası) tohum verisiyle tutarlı.
- [ ] Başka marka adıyla aramada "muadil" ifadesi üretilmiyor (değerlendirme testi).
- [ ] Test ucu, hız sınırı ve bot korumasıyla dakikada 100 istek altında 300 ms yanıt veriyor.
