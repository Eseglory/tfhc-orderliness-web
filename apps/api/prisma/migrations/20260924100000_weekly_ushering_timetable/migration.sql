-- CreateEnum
CREATE TYPE "TimetablePeriodStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TimetableVersionStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "TimetableGenerationType" AS ENUM ('SCHEDULED_AUTO', 'MANUAL_INITIAL', 'MANUAL_REGENERATE', 'MANUAL_ADJUSTMENT', 'CATCH_UP');

-- CreateEnum
CREATE TYPE "TimetableReviewDecision" AS ENUM ('APPROVED', 'REJECTED', 'CHANGES_REQUESTED');

-- CreateTable
CREATE TABLE "timetable_periods" (
    "id" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "label" TEXT NOT NULL,
    "status" "TimetablePeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "publishedAt" TIMESTAMP(3),
    "publishedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_versions" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "status" "TimetableVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "generationType" "TimetableGenerationType" NOT NULL DEFAULT 'MANUAL_INITIAL',
    "generatedByUserId" TEXT,
    "metadata" JSONB,
    "summary" JSONB,
    "publishedAt" TIMESTAMP(3),
    "publishedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_service_sessions" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "serviceScheduleId" TEXT,
    "serviceDay" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "serviceDate" DATE NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "requiredUshers" INTEGER NOT NULL DEFAULT 5,
    "assignedUshersCount" INTEGER NOT NULL DEFAULT 0,
    "isFullyStaffed" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_service_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_assignments" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USHER',
    "position" TEXT,
    "isManualAdjustment" BOOLEAN NOT NULL DEFAULT false,
    "adjustedByUserId" TEXT,
    "adjustmentReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_reviewers" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "designatedByUserId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "orderIndex" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_reviewers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_reviews" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "reviewerUserId" TEXT NOT NULL,
    "decision" "TimetableReviewDecision" NOT NULL,
    "comments" TEXT,
    "rejectionReason" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timetable_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clock_in_attempts" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "meetingId" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "deviceInfo" TEXT,

    CONSTRAINT "clock_in_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "timetable_periods_weekStart_key" ON "timetable_periods"("weekStart");

-- CreateIndex
CREATE INDEX "timetable_periods_status_idx" ON "timetable_periods"("status");

-- CreateIndex
CREATE INDEX "timetable_versions_periodId_status_idx" ON "timetable_versions"("periodId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_versions_periodId_versionNumber_key" ON "timetable_versions"("periodId", "versionNumber");

-- CreateIndex
CREATE INDEX "timetable_service_sessions_versionId_serviceDate_idx" ON "timetable_service_sessions"("versionId", "serviceDate");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_service_sessions_versionId_sessionKey_key" ON "timetable_service_sessions"("versionId", "sessionKey");

-- CreateIndex
CREATE INDEX "timetable_assignments_sessionId_idx" ON "timetable_assignments"("sessionId");

-- CreateIndex
CREATE INDEX "timetable_assignments_memberId_idx" ON "timetable_assignments"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_assignments_sessionId_memberId_key" ON "timetable_assignments"("sessionId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_reviewers_userId_key" ON "timetable_reviewers"("userId");

-- CreateIndex
CREATE INDEX "timetable_reviewers_active_idx" ON "timetable_reviewers"("active");

-- CreateIndex
CREATE INDEX "timetable_reviews_versionId_decision_idx" ON "timetable_reviews"("versionId", "decision");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_reviews_versionId_reviewerUserId_key" ON "timetable_reviews"("versionId", "reviewerUserId");

-- CreateIndex
CREATE INDEX "clock_in_attempts_memberId_attemptedAt_idx" ON "clock_in_attempts"("memberId", "attemptedAt");

-- AddForeignKey
ALTER TABLE "timetable_periods" ADD CONSTRAINT "timetable_periods_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_versions" ADD CONSTRAINT "timetable_versions_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "timetable_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_versions" ADD CONSTRAINT "timetable_versions_generatedByUserId_fkey" FOREIGN KEY ("generatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_service_sessions" ADD CONSTRAINT "timetable_service_sessions_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "timetable_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_assignments" ADD CONSTRAINT "timetable_assignments_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "timetable_service_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_assignments" ADD CONSTRAINT "timetable_assignments_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_reviewers" ADD CONSTRAINT "timetable_reviewers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_reviewers" ADD CONSTRAINT "timetable_reviewers_designatedByUserId_fkey" FOREIGN KEY ("designatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_reviews" ADD CONSTRAINT "timetable_reviews_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "timetable_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_reviews" ADD CONSTRAINT "timetable_reviews_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clock_in_attempts" ADD CONSTRAINT "clock_in_attempts_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS policies for security
ALTER TABLE "timetable_periods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "timetable_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "timetable_service_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "timetable_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "timetable_reviewers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "timetable_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clock_in_attempts" ENABLE ROW LEVEL SECURITY;
