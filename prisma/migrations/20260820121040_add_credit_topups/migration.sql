-- AlterTable
ALTER TABLE "User" ADD COLUMN     "creditBalance" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CreditTopup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountRupees" INTEGER NOT NULL,
    "stripeCheckoutSessionId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditTopup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditTopup_stripeCheckoutSessionId_key" ON "CreditTopup"("stripeCheckoutSessionId");

-- CreateIndex
CREATE INDEX "CreditTopup_userId_createdAt_idx" ON "CreditTopup"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "CreditTopup" ADD CONSTRAINT "CreditTopup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
