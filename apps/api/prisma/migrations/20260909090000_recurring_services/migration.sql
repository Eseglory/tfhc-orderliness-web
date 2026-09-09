CREATE TABLE "service_schedules" (
  "id" TEXT PRIMARY KEY, "title" TEXT NOT NULL, "dayOfWeek" INTEGER NOT NULL,
  "startMinutes" INTEGER NOT NULL, "endMinutes" INTEGER, "categoryName" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "schedule_weekday" CHECK ("dayOfWeek" BETWEEN 0 AND 6),
  CONSTRAINT "schedule_start" CHECK ("startMinutes" BETWEEN 0 AND 1439),
  CONSTRAINT "schedule_end" CHECK ("endMinutes" IS NULL OR ("endMinutes" > "startMinutes" AND "endMinutes" <= 1440))
);
ALTER TABLE "service_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "meetings" ADD COLUMN "serviceScheduleId" TEXT;
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_serviceScheduleId_fkey" FOREIGN KEY ("serviceScheduleId") REFERENCES "service_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "meetings_serviceScheduleId_startTime_key" ON "meetings"("serviceScheduleId", "startTime");
