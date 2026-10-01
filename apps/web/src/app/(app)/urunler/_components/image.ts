/**
 * Seçilen görseli tarayıcıda ölçekler ve JPEG/PNG data URL'ye çevirir. Büyük telefon fotoğrafları
 * küçültülür (en çok 1400px) → vitrin kartları hızlı ve tutarlı yüklenir, sunucu sınırını aşmaz.
 * Saydamlık içeren PNG'ler PNG olarak korunur; diğerleri JPEG'e sıkıştırılır.
 */
const MAX_EDGE = 1400;
const JPEG_QUALITY = 0.85;

export async function fileToResizedDataUrl(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    throw new Error("Görsel JPEG, PNG veya WEBP olmalı.");
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Görsel işlenemedi.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const usePng = file.type === "image/png";
  return canvas.toDataURL(usePng ? "image/png" : "image/jpeg", usePng ? undefined : JPEG_QUALITY);
}
