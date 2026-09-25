/*
  Warnings:

  - Added the required column `itemId` to the `StockReservation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `refId` to the `StockReservation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `refType` to the `StockReservation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `StockReservation` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ApprovalRequest" ADD COLUMN     "payload" JSONB;

-- AlterTable
ALTER TABLE "CycleCount" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "needsApproval" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "varianceValue" DECIMAL(18,2);

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "belowMinNotifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StockReservation" ADD COLUMN     "consumedAt" TIMESTAMP(3),
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "itemId" TEXT NOT NULL,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "refId" TEXT NOT NULL,
ADD COLUMN     "refType" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "orderLineId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "ApprovalRequest_status_createdAt_idx" ON "ApprovalRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CycleCount_warehouseId_status_idx" ON "CycleCount"("warehouseId", "status");

-- CreateIndex
CREATE INDEX "StockReservation_refType_refId_idx" ON "StockReservation"("refType", "refId");

-- CreateIndex
CREATE INDEX "StockReservation_lotId_releasedAt_consumedAt_idx" ON "StockReservation"("lotId", "releasedAt", "consumedAt");

-- CreateIndex
CREATE INDEX "StockReservation_itemId_releasedAt_consumedAt_idx" ON "StockReservation"("itemId", "releasedAt", "consumedAt");

-- CreateIndex
CREATE INDEX "StockReservation_orderLineId_idx" ON "StockReservation"("orderLineId");

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleCount" ADD CONSTRAINT "CycleCount_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- İş kuralı kısıtları (Prisma şemasında ifade edilemez)
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_qty_positive" CHECK (qty > 0);
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_single_close"
  CHECK (NOT ("releasedAt" IS NOT NULL AND "consumedAt" IS NOT NULL));
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_qty_positive" CHECK (qty > 0);
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_non_negative"
  CHECK ("qtyOnHand" >= 0 AND "qtyReserved" >= 0 AND "qtyReserved" <= "qtyOnHand");
