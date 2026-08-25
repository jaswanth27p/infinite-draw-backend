-- DropIndex
DROP INDEX "CreditTopup_stripeCheckoutSessionId_key";

-- AlterTable
ALTER TABLE "CreditTopup" DROP COLUMN "stripeCheckoutSessionId",
DROP COLUMN "stripePaymentIntentId",
ADD COLUMN     "razorpayOrderId" TEXT NOT NULL,
ADD COLUMN     "razorpayPaymentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CreditTopup_razorpayOrderId_key" ON "CreditTopup"("razorpayOrderId");
