# ADR-0006 · Şişe 3B görüntüleme (three.js)

- **Durum:** Kabul edildi
- **Tarih:** 2026-09-26
- **Bağlam:** EMA kendi parfüm şişesinin 3B modelini (.obj) sağladı. Vitrinde ve üretim ekranında
  şişeyi interaktif (döndürülebilir) göstermek marka algısını güçlendiriyor.

## Karar
`apps/web` içinde **three.js** (`three` + `@types/three`) kullanılır. Model `apps/web/public/ema/`
altında statik servis edilir; `BottleViewer` istemci bileşeni `OBJLoader` ile yükler, malzemeleri
kodda tanımlar (yeşil cam, altın kapak; `.mtl` sağlanmadı), `RoomEnvironment` ile aydınlatır ve
`OrbitControls` ile döndürür. Yüklenene kadar poster (temiz render PNG) gösterilir; WebGL/yükleme
başarısız olursa poster kalıcı fallback olur.

## Gerekçe
- three.js olgun, bağımlılıksız (peer yok), ağaç sarsımıyla yalnızca kullanılan modüller alınır.
- `<model-viewer>` .glb ister; elimizde .obj var, ek dönüşüm gerektirir. OBJLoader doğrudan çalışır.

## Sonuçlar
- İstemci paketi three kadar büyür (~yalnızca vitrin/üretim rotalarında dinamik import ile yüklenir).
- İleride .glb'ye geçiş (daha küçük, PBR malzemeli) yapılabilir; ADR güncellenir.
