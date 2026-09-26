-- CreateEnum
CREATE TYPE "ConsentPurpose" AS ENUM ('KVKK', 'MARKETING');

-- DropIndex
DROP INDEX "Customer_email_idx";

-- DropIndex
DROP INDEX "Customer_phone_idx";

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "emailHash" TEXT,
ADD COLUMN     "phoneHash" TEXT,
ADD COLUMN     "taxNoHash" TEXT;

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "purpose" "ConsentPurpose" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "channel" TEXT NOT NULL,
    "textVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsentRecord_customerId_purpose_createdAt_idx" ON "ConsentRecord"("customerId", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX "Customer_emailHash_idx" ON "Customer"("emailHash");

-- CreateIndex
CREATE INDEX "Customer_phoneHash_idx" ON "Customer"("phoneHash");

-- CreateIndex
CREATE INDEX "Customer_taxNoHash_idx" ON "Customer"("taxNoHash");

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
