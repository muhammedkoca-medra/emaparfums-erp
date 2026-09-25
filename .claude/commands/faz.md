---
description: Yol haritasındaki bir fazı planla ve uygula
argument-hint: <faz no, ör. 1>
---
Faz $ARGUMENTS üzerinde çalışacağız.

1. `docs/05-yol-haritasi.md` içinden Faz $ARGUMENTS bölümünü, bağımlı olduğu fazların çıkış kriterlerini ve işaretlenmemiş görevleri oku.
2. Önceki fazın çıkış kriterleri karşılanmamışsa dur ve eksikleri listele.
3. İşaretlenmemiş görevlerden ilkini seç. İlgili `docs/03-moduller/*.md` şartnamesini ve `docs/02-veri-modeli.md` bölümünü oku.
4. Kısa bir plan yaz: etkilenen dosyalar, şema değişikliği, uç noktalar, olaylar, testler. Plan açık bir karar gerektiriyorsa kullanıcıya sor.
5. Uygula. `CLAUDE.md` içindeki temel kurallara uy (stok hareketi, vergi, olay, denetim, dil).
6. `pnpm lint && pnpm typecheck && pnpm test` çalıştır; geçene kadar düzelt.
7. Görevi `docs/05-yol-haritasi.md` içinde işaretle, değişen şartnameyi güncelle, kısa bir özet ver ve sıradaki göreve geçmeden önce onay iste.
