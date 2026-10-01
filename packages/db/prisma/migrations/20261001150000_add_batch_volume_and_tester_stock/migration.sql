-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "testerItemId" TEXT;

-- AlterTable
ALTER TABLE "ProductionBatch" ADD COLUMN     "baseMl" DECIMAL(12,2),
ADD COLUMN     "essenceMl" DECIMAL(12,2),
ADD COLUMN     "plannedMl" DECIMAL(12,2),
ADD COLUMN     "scrapMl" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "testerMl" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "Product_testerItemId_key" ON "Product"("testerItemId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_testerItemId_fkey" FOREIGN KEY ("testerItemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

