CREATE TYPE "WeeklyAvailabilityState" AS ENUM ('OPEN', 'FINALIZED', 'CANCELLED');
CREATE TYPE "ServiceCommitmentStatus" AS ENUM ('COMMITTED', 'NOT_COMMITTED');

CREATE TABLE "weekly_availability_cycles" (
  "id" TEXT NOT NULL,
  "weekStart" DATE NOT NULL,
  "opensAt" TIMESTAMP(3) NOT NULL,
  "closesAt" TIMESTAMP(3) NOT NULL,
  "state" "WeeklyAvailabilityState" NOT NULL DEFAULT 'OPEN',
  "finalizedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "weekly_availability_cycles_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "member_service_commitments" (
  "id" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "meetingId" TEXT NOT NULL,
  "status" "ServiceCommitmentStatus" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "member_service_commitments_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "weekly_availability_responses" (
  "id" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "weekly_availability_responses_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "weekly_availability_cycles_weekStart_key" ON "weekly_availability_cycles"("weekStart");
CREATE INDEX "weekly_availability_cycles_state_closesAt_idx" ON "weekly_availability_cycles"("state", "closesAt");
CREATE UNIQUE INDEX "member_service_commitments_cycleId_memberId_meetingId_key" ON "member_service_commitments"("cycleId", "memberId", "meetingId");
CREATE INDEX "member_service_commitments_cycleId_meetingId_status_idx" ON "member_service_commitments"("cycleId", "meetingId", "status");
CREATE UNIQUE INDEX "weekly_availability_responses_cycleId_memberId_key" ON "weekly_availability_responses"("cycleId", "memberId");
CREATE INDEX "weekly_availability_responses_cycleId_idx" ON "weekly_availability_responses"("cycleId");
ALTER TABLE "member_service_commitments" ADD CONSTRAINT "member_service_commitments_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "weekly_availability_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member_service_commitments" ADD CONSTRAINT "member_service_commitments_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member_service_commitments" ADD CONSTRAINT "member_service_commitments_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "weekly_availability_responses" ADD CONSTRAINT "weekly_availability_responses_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "weekly_availability_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "weekly_availability_responses" ADD CONSTRAINT "weekly_availability_responses_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
