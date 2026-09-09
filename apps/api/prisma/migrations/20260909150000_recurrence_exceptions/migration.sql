-- Generalised recurrence rules + per-occurrence exceptions for recurring series.

-- CreateEnum
CREATE TYPE "ServiceExceptionKind" AS ENUM ('SKIP', 'MODIFIED');

-- AlterTable
ALTER TABLE "meetings" ADD COLUMN     "isException" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "occurrenceStart" TIMESTAMP(3);

-- AlterTable (defaults on the timestamps so existing rows backfill cleanly)
ALTER TABLE "service_schedules" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "eventTypeKey" TEXT,
ADD COLUMN     "horizonDays" INTEGER NOT NULL DEFAULT 28,
ADD COLUMN     "recurrenceRule" JSONB,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "visibility" "EventVisibility" NOT NULL DEFAULT 'PUBLIC';

-- CreateTable
CREATE TABLE "service_schedule_exceptions" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "occurrenceStart" TIMESTAMP(3) NOT NULL,
    "kind" "ServiceExceptionKind" NOT NULL,
    "createdById" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_schedule_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_schedule_exceptions_scheduleId_idx" ON "service_schedule_exceptions"("scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "service_schedule_exceptions_scheduleId_occurrenceStart_key" ON "service_schedule_exceptions"("scheduleId", "occurrenceStart");

-- AddForeignKey
ALTER TABLE "service_schedule_exceptions" ADD CONSTRAINT "service_schedule_exceptions_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "service_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS parity.
ALTER TABLE "service_schedule_exceptions" ENABLE ROW LEVEL SECURITY;

-- Backfill occurrenceStart for meetings already generated from a schedule so
-- exception matching works retroactively.
UPDATE "meetings" SET "occurrenceStart" = "startTime" WHERE "serviceScheduleId" IS NOT NULL AND "occurrenceStart" IS NULL;

-- Map legacy service-schedule categories onto event-type keys.
UPDATE "service_schedules" SET "eventTypeKey" = CASE
  WHEN "categoryName" IN ('Sunday Service','Midweek Service') THEN 'SERVICE'
  WHEN "categoryName" IN ('Training','Seminar') THEN 'TRAINING'
  WHEN "categoryName" = 'Special Programme' THEN 'SPECIAL_SERVICE'
  ELSE 'SERVICE'
END
WHERE "eventTypeKey" IS NULL;
