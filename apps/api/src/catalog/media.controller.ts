import { Controller, Get, Header, Inject, NotFoundException, Param, StreamableFile } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { APP_CONFIG, type AppConfig } from "../config.js";
import { Public } from "../permissions/decorators.js";
import { readProductImage } from "./product-image.js";

/**
 * Yüklenen ürün görsellerini servis eder (herkese açık). Dosya adı içerik hash'li olduğundan
 * kalıcı olarak önbelleğe alınabilir (immutable). Tarayıcıya aynı kökten /api/media/... gelir.
 */
@ApiTags("media")
@Controller("media")
export class MediaController {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  @Get("products/:file")
  @Public()
  @Header("Cache-Control", "public, max-age=31536000, immutable")
  async productImage(@Param("file") file: string): Promise<StreamableFile> {
    const img = await readProductImage(this.config.UPLOADS_DIR, file);
    if (!img) throw new NotFoundException({ message: "Görsel bulunamadı" });
    return new StreamableFile(img.data, { type: img.type });
  }
}
