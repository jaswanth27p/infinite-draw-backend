-- CreateEnum
CREATE TYPE "AiUsageStatus" AS ENUM ('RESERVED', 'SETTLED', 'REFUNDED');

-- CreateTable
CREATE TABLE "AiUsageReservation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "status" "AiUsageStatus" NOT NULL DEFAULT 'RESERVED',
    "estimatedCostRupees" DECIMAL(65,30) NOT NULL,
    "actualCostRupees" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "AiUsageReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiUsageReservation_requestId_key" ON "AiUsageReservation"("requestId");

-- CreateIndex
CREATE INDEX "AiUsageReservation_status_createdAt_idx" ON "AiUsageReservation"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "AiUsageReservation" ADD CONSTRAINT "AiUsageReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
