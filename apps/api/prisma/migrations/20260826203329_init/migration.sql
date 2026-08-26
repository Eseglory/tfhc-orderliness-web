-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'LEADER', 'MEMBER');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ON_LEAVE', 'SUSPENDED', 'EXEMPT', 'NEW_MEMBER');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('EARLY', 'ON_TIME', 'GRACE_PERIOD', 'LATE', 'ABSENT', 'EXCUSED', 'EXEMPT');

-- CreateEnum
CREATE TYPE "AttendanceMethod" AS ENUM ('SYSTEM_GEO_QR', 'SYSTEM_GEO', 'MANUAL', 'CORRECTION_APPROVED');

-- CreateEnum
CREATE TYPE "ExcuseStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_teams" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "sub_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "memberCode" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "gender" TEXT,
    "subTeamId" TEXT,
    "roleInUnit" TEXT NOT NULL DEFAULT 'Member',
    "dateJoined" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "basePoints" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "pointWeight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,

    CONSTRAINT "meeting_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "meetingDate" TIMESTAMP(3) NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "expectedArrivalTime" TIMESTAMP(3) NOT NULL,
    "attendanceOpenTime" TIMESTAMP(3) NOT NULL,
    "attendanceCloseTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "locationName" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "geofenceRadiusMeters" DOUBLE PRECISION NOT NULL DEFAULT 100.0,
    "status" "MeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "isCompulsory" BOOLEAN NOT NULL DEFAULT true,
    "pointWeight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "qrSecret" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "expectedArrivalTime" TIMESTAMP(3) NOT NULL,
    "actualArrivalTime" TIMESTAMP(3),
    "status" "AttendanceStatus" NOT NULL,
    "gpsLat" DOUBLE PRECISION,
    "gpsLong" DOUBLE PRECISION,
    "gpsAccuracy" DOUBLE PRECISION,
    "distanceFromVenue" DOUBLE PRECISION,
    "method" "AttendanceMethod" NOT NULL DEFAULT 'SYSTEM_GEO_QR',
    "pointsEarned" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deviceInfo" TEXT,
    "isModified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "absence_excuses" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" "ExcuseStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "absence_excuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correction_requests" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "requestedStatus" "AttendanceStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ExcuseStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "correction_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_up_flags" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "flagLevel" INTEGER NOT NULL,
    "flagReason" TEXT NOT NULL,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "follow_up_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_summaries" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "expectedCount" INTEGER NOT NULL,
    "presentCount" INTEGER NOT NULL,
    "absentCount" INTEGER NOT NULL,
    "earlyCount" INTEGER NOT NULL,
    "onTimeCount" INTEGER NOT NULL,
    "gracePeriodCount" INTEGER NOT NULL,
    "lateCount" INTEGER NOT NULL,
    "excusedCount" INTEGER NOT NULL,
    "attendanceRate" DOUBLE PRECISION NOT NULL,
    "punctualityRate" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "previousData" JSONB,
    "newData" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sub_teams_name_key" ON "sub_teams"("name");

-- CreateIndex
CREATE UNIQUE INDEX "members_userId_key" ON "members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "members_memberCode_key" ON "members"("memberCode");

-- CreateIndex
CREATE INDEX "members_status_idx" ON "members"("status");

-- CreateIndex
CREATE INDEX "members_subTeamId_idx" ON "members"("subTeamId");

-- CreateIndex
CREATE INDEX "members_status_subTeamId_idx" ON "members"("status", "subTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_categories_name_key" ON "meeting_categories"("name");

-- CreateIndex
CREATE INDEX "meetings_status_idx" ON "meetings"("status");

-- CreateIndex
CREATE INDEX "meetings_startTime_idx" ON "meetings"("startTime");

-- CreateIndex
CREATE INDEX "meetings_status_attendanceOpenTime_attendanceCloseTime_idx" ON "meetings"("status", "attendanceOpenTime", "attendanceCloseTime");

-- CreateIndex
CREATE INDEX "attendance_records_memberId_idx" ON "attendance_records"("memberId");

-- CreateIndex
CREATE INDEX "attendance_records_meetingId_idx" ON "attendance_records"("meetingId");

-- CreateIndex
CREATE INDEX "attendance_records_status_idx" ON "attendance_records"("status");

-- CreateIndex
CREATE INDEX "attendance_records_memberId_status_idx" ON "attendance_records"("memberId", "status");

-- CreateIndex
CREATE INDEX "attendance_records_actualArrivalTime_idx" ON "attendance_records"("actualArrivalTime");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_memberId_meetingId_key" ON "attendance_records"("memberId", "meetingId");

-- CreateIndex
CREATE INDEX "absence_excuses_status_idx" ON "absence_excuses"("status");

-- CreateIndex
CREATE UNIQUE INDEX "absence_excuses_memberId_meetingId_key" ON "absence_excuses"("memberId", "meetingId");

-- CreateIndex
CREATE INDEX "correction_requests_status_idx" ON "correction_requests"("status");

-- CreateIndex
CREATE INDEX "follow_up_flags_isResolved_idx" ON "follow_up_flags"("isResolved");

-- CreateIndex
CREATE INDEX "follow_up_flags_isResolved_flagLevel_idx" ON "follow_up_flags"("isResolved", "flagLevel");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_summaries_meetingId_key" ON "meeting_summaries"("meetingId");

-- CreateIndex
CREATE INDEX "audit_logs_actorUserId_idx" ON "audit_logs"("actorUserId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_subTeamId_fkey" FOREIGN KEY ("subTeamId") REFERENCES "sub_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "meeting_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absence_excuses" ADD CONSTRAINT "absence_excuses_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absence_excuses" ADD CONSTRAINT "absence_excuses_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_flags" ADD CONSTRAINT "follow_up_flags_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_summaries" ADD CONSTRAINT "meeting_summaries_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
