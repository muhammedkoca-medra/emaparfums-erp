import { type Db } from "@atelier/db";

/**
 * Prisma istemcisi için DI belirteci. Sağlayıcı app.module.ts'te createPrismaClient ile kurulur.
 * Sınıf + arayüz birleşimi: enjeksiyonda sınıf belirteç olur, tipte PrismaClient'ın tüm yüzeyi görünür.
 * Sınıfın kendisi hiç örneklenmez; bu yüzden birleştirme burada güvenlidir.
 */
/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type */
export abstract class PrismaService {}
export interface PrismaService extends Db {}
/* eslint-enable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type */
