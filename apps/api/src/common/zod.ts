import { BadRequestException, type PipeTransform } from "@nestjs/common";
import { ApiBody, ApiQuery } from "@nestjs/swagger";
import { z } from "zod";

/** zod şemasıyla doğrulayan pipe. Hata mesajı Türkçe, alan yollarıyla döner. */
export class ZodPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}
  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: "Gönderilen veri geçersiz",
        issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    return result.data;
  }
}

/** OpenAPI belgesine zod şemasından istek gövdesi ekler. */
export const ApiZodBody = (schema: z.ZodType) =>
  ApiBody({ schema: z.toJSONSchema(schema, { io: "input" }) as Record<string, unknown> });

/** OpenAPI belgesine zod nesnesinin alanlarını sorgu parametresi olarak ekler. */
export function ApiZodQuery(schema: z.ZodObject): MethodDecorator {
  return (target, key, descriptor) => {
    for (const name of Object.keys(schema.shape))
      ApiQuery({ name, required: false })(target, key, descriptor);
  };
}
