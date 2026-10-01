/**
 * Ürün görseli dosya deposu. Görseller multipart yerine JSON içinde base64 data URL olarak gelir
 * (ek bağımlılık gerekmesin diye), diske yazılır ve herkese açık /media ucundan servis edilir.
 * Üretimde UPLOADS_DIR kalıcı bir Docker volume'una denk gelir; yeniden derlemede kaybolmaz.
 */
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/** Yüklenebilecek en büyük görsel. Vitrin kartları için 4 MB fazlasıyla yeterli. */
export const PRODUCT_IMAGE_MAX_BYTES = 4 * 1024 * 1024;

export interface DecodedImage {
  buffer: Buffer;
  ext: string;
}

/** `data:image/jpeg;base64,...` biçimini çözer; tür ve boyut doğrular. */
export function decodeImageDataUrl(dataUrl: string): DecodedImage {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  const mime = match?.[1];
  const payload = match?.[2];
  if (!mime || !payload) throw new Error("Görsel JPEG, PNG veya WEBP olmalı.");
  const ext = EXT_BY_MIME[mime];
  if (!ext) throw new Error("Görsel JPEG, PNG veya WEBP olmalı.");
  const buffer = Buffer.from(payload, "base64");
  if (buffer.length === 0) throw new Error("Görsel boş.");
  if (buffer.length > PRODUCT_IMAGE_MAX_BYTES) throw new Error("Görsel en fazla 4 MB olabilir.");
  return { buffer, ext };
}

/** Ürün görsellerinin tutulduğu mutlak klasör. Göreli UPLOADS_DIR, çalışma dizinine göre çözülür. */
export function productsDir(uploadsDir: string): string {
  const base = path.isAbsolute(uploadsDir) ? uploadsDir : path.resolve(process.cwd(), uploadsDir);
  return path.join(base, "products");
}

async function removeProductFiles(dir: string, productId: string): Promise<void> {
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return;
  }
  await Promise.all(
    files.filter((f) => f.startsWith(`${productId}-`)).map((f) => rm(path.join(dir, f), { force: true })),
  );
}

/** Ürün görselini yazar (eski sürümlerini siler), herkese açık URL'yi döndürür. Dosya adı içeriğe göre hash'li → önbellek güvenli. */
export async function saveProductImage(uploadsDir: string, productId: string, img: DecodedImage): Promise<string> {
  const dir = productsDir(uploadsDir);
  await mkdir(dir, { recursive: true });
  await removeProductFiles(dir, productId);
  const hash = createHash("sha1").update(img.buffer).digest("hex").slice(0, 10);
  const file = `${productId}-${hash}.${img.ext}`;
  await writeFile(path.join(dir, file), img.buffer);
  return `/api/media/products/${file}`;
}

/** Bir ürünün tüm görsel dosyalarını siler (ürün silinince ya da görsel kaldırılınca). */
export async function removeProductImages(uploadsDir: string, productId: string): Promise<void> {
  await removeProductFiles(productsDir(uploadsDir), productId);
}

/** Servis için dosyayı okur; güvenli dosya adı ve içerik türünü doğrular. */
export async function readProductImage(uploadsDir: string, file: string): Promise<{ data: Buffer; type: string } | null> {
  if (!/^[A-Za-z0-9._-]+$/.test(file) || file.includes("..")) return null;
  const type = MIME_BY_EXT[path.extname(file).toLowerCase()];
  if (!type) return null;
  try {
    const data = await readFile(path.join(productsDir(uploadsDir), file));
    return { data, type };
  } catch {
    return null;
  }
}
