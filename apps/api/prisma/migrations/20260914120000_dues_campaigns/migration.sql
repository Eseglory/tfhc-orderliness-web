-- Generalises DuesPeriod so a one-off "special contribution" campaign
-- (e.g. a Christmas Party fund with its own deadline and bank account) can
-- coexist with the regular recurring monthly dues periods.

-- CreateEnum
CREATE TYPE "DuesPeriodType" AS ENUM ('MONTHLY', 'SPECIAL');

-- AlterEnum
ALTER TYPE "PaymentPurpose" ADD VALUE 'SPECIAL_CONTRIBUTION';

-- DropIndex
DROP INDEX "dues_periods_year_month_key";

-- AlterTable
ALTER TABLE "dues_periods"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "paymentAccountId" TEXT,
  ADD COLUMN "showAsAlert" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "type" "DuesPeriodType" NOT NULL DEFAULT 'MONTHLY';

-- CreateIndex
CREATE INDEX "dues_periods_year_month_idx" ON "dues_periods"("year", "month");

-- CreateIndex
CREATE INDEX "dues_periods_type_status_idx" ON "dues_periods"("type", "status");

-- AddForeignKey
ALTER TABLE "dues_periods" ADD CONSTRAINT "dues_periods_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "payment_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
