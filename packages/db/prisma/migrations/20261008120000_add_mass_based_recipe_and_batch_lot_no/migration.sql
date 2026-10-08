-- CreateEnum
CREATE TYPE "RecipeRole" AS ENUM ('ESSENCE', 'ALCOHOL', 'WATER', 'GLYCERIN', 'OTHER');

-- AlterTable
ALTER TABLE "Formula" ADD COLUMN     "densityGPerMl" DECIMAL(6,4);

-- AlterTable
ALTER TABLE "ProductionBatch" ADD COLUMN     "densityGPerMl" DECIMAL(6,4),
ADD COLUMN     "lotNo" TEXT,
ADD COLUMN     "totalGr" DECIMAL(18,4);

-- CreateTable
CREATE TABLE "FormulaComponent" (
    "id" TEXT NOT NULL,
    "formulaId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "role" "RecipeRole" NOT NULL,
    "massPct" DECIMAL(7,4) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormulaComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchComponent" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "role" "RecipeRole" NOT NULL,
    "massPct" DECIMAL(7,4) NOT NULL,
    "grams" DECIMAL(18,4) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatchComponent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FormulaComponent_formulaId_idx" ON "FormulaComponent"("formulaId");

-- CreateIndex
CREATE INDEX "FormulaComponent_itemId_idx" ON "FormulaComponent"("itemId");

-- CreateIndex
CREATE INDEX "BatchComponent_batchId_idx" ON "BatchComponent"("batchId");

-- CreateIndex
CREATE INDEX "BatchComponent_itemId_idx" ON "BatchComponent"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionBatch_productId_lotNo_key" ON "ProductionBatch"("productId", "lotNo");

-- AddForeignKey
ALTER TABLE "FormulaComponent" ADD CONSTRAINT "FormulaComponent_formulaId_fkey" FOREIGN KEY ("formulaId") REFERENCES "Formula"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormulaComponent" ADD CONSTRAINT "FormulaComponent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchComponent" ADD CONSTRAINT "BatchComponent_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProductionBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchComponent" ADD CONSTRAINT "BatchComponent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

