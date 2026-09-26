-- CreateEnum
CREATE TYPE "BottleType" AS ENUM ('METAL', 'AMBER');

-- AlterTable
ALTER TABLE "ProductionBatch" ADD COLUMN     "baseGr" DECIMAL(12,2),
ADD COLUMN     "bottleType" "BottleType",
ADD COLUMN     "essenceGr" DECIMAL(12,2),
ADD COLUMN     "macerationPlace" TEXT;
