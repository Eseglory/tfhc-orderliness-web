-- CreateEnum
CREATE TYPE "AttendanceType" AS ENUM ('PHYSICAL', 'ONLINE');

-- AlterEnum
ALTER TYPE "AttendanceMethod" ADD VALUE IF NOT EXISTS 'ONLINE_SESSION';
ALTER TYPE "AttendanceMethod" ADD VALUE IF NOT EXISTS 'ONLINE_CODE';

-- AlterTable
ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "attendanceType" "AttendanceType" NOT NULL DEFAULT 'PHYSICAL';
ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "joinedAt" TIMESTAMP(3);
ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3);
ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "leftAt" TIMESTAMP(3);
ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "durationMinutes" INTEGER;
ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "sessionTokenHash" TEXT;

-- AlterTable
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "isOnline" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "attendanceCode" TEXT;
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "attendanceCodeExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "attendance_records_attendanceType_idx" ON "attendance_records"("attendanceType");
