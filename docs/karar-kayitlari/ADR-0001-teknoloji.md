# ADR-0001 · Teknoloji yığını

- **Durum:** Önerildi (25 Eylül 2026)
- **Karar veren:** [Proje sahibi]

## Bağlam

- Tek bir veri çekirdeği etrafında 18 modül, yoğun dış entegrasyon (pazaryeri, e-belge, ödeme, kargo), bir web paneli ve bir mobil depo uygulaması gerekiyor.
- Ekip küçük olacak ve geliştirmenin önemli kısmı Claude Code ile yapılacak.
- Bu yüzden tek dil (TypeScript) ve tek depo tercih ediliyor.

## Karar

| Katman | Seçim | Neden |
|---|---|---|
| Dil | TypeScript (strict) | Web, API, worker ve mobilde tek dil; tipler paylaşılır |
| Depo | pnpm + Turborepo monorepo | Paylaşılan paketler, tek CI |
| Veritabanı | PostgreSQL 16 | İlişkisel bütünlük, transaction, JSONB, ileride pgvector (koku benzerliği) |
| ORM | Prisma 7 (`@prisma/adapter-pg`) | Şema tek dosyada okunur; Claude Code için net sözleşme |
| API | NestJS | Modül yapısı dokümandaki modüllerle birebir eşleşir; guard/interceptor ile yetki ve denetim |
| Web | Next.js (App Router) + Tailwind | Olgun ekosistem, sunucu tarafı render |
| Kuyruk | BullMQ + Redis | Entegrasyon senkronu, tekrar deneme, zamanlanmış işler |
| Mobil | Expo (React Native) | Tek kod tabanıyla Android el terminali ve iOS |
| Dosya | S3 uyumlu (yerelde MinIO) | Fatura PDF, ürün görselleri, QC belgeleri |
| AI | Anthropic Claude API | İçerik üretimi, koku profili çıkarımı, öneri açıklamaları |

## Sonuçlar

- Barındırma kararı (Türkiye'de veri merkezi veya bulut bölgesi) KVKK açısından ayrıca verilecek: ADR-0002.
- Muhasebe ayrı bir yazılımda kalacak; Atelier yevmiye verisini aktaracak, çift kayıtlı muhasebe yapmayacak: ADR-0003.
