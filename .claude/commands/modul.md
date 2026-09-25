---
description: Bir modülü şartnamesine göre uçtan uca geliştir
argument-hint: <modül dosya adı, ör. stok>
---
`docs/03-moduller/$ARGUMENTS.md` şartnamesine göre modülü geliştir.

Sıra:
1. Şartnamedeki "Varlıklar" bölümünü `packages/db/prisma/schema.prisma` ile karşılaştır. Eksik varsa önce `docs/02-veri-modeli.md`'yi, sonra şemayı güncelle ve migration oluştur. Değişikliği `veri-modeli-muhafizi` alt ajanına incelet.
2. `apps/api/src/modules/$ARGUMENTS/` altında: zod şemaları (`packages/shared`), servis, controller, `@RequirePermission` korumaları.
3. "Olaylar" bölümündeki yayınlanan olayları OutboxEvent ile yaz, dinlenen olaylar için `apps/worker` işleyicisi ekle.
4. "İş kuralları" bölümündeki her kural için birim test (`test-yazari` alt ajanını kullanabilirsin) ve her uç nokta için e2e test.
5. `apps/web/app/(app)/$ARGUMENTS/` ekranları: prototipteki düzen ve `docs/06-tasarim-sistemi.md` token'ları. Metinler `messages/tr.json`'a.
6. Vergi/fatura/KVKK dokunuyorsa `mevzuat-denetcisi` alt ajanına incelet.
7. "Kabul kriterleri"ni tek tek doğrula ve sonucu raporla.
