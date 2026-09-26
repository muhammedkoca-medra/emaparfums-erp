-- CreateTable
CREATE TABLE "FxRate" (
    "id" TEXT NOT NULL,
    "base" TEXT NOT NULL DEFAULT 'TRY',
    "quote" TEXT NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "date" DATE NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'FX_TCMB',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FxRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FxRate_date_idx" ON "FxRate"("date");

-- CreateIndex
CREATE UNIQUE INDEX "FxRate_quote_date_key" ON "FxRate"("quote", "date");
