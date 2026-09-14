-- CreateEnum
CREATE TYPE "ApprovedMemberInviteStatus" AS ENUM ('NOT_INVITED', 'PENDING', 'ACCEPTED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "ServiceCategory" AS ENUM ('ADVISORY', 'CONSULTATION', 'COUNSELING', 'TECHNICAL', 'FACILITY', 'ADMINISTRATIVE', 'OTHER');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "AppointmentMode" AS ENUM ('IN_PERSON', 'VIDEO_CONFERENCE', 'PHONE_CALL');

-- CreateEnum
CREATE TYPE "CalendarSyncStatus" AS ENUM ('NOT_CONNECTED', 'SYNCED', 'SYNCING', 'PENDING', 'FAILED');

-- AlterEnum
ALTER TYPE "ExcuseStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "absence_excuses" ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "requestType" TEXT NOT NULL DEFAULT 'MEETING',
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "supportingDocUrl" TEXT,
ALTER COLUMN "meetingId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "approval_steps" ADD COLUMN     "approverMemberId" TEXT;

-- AlterTable
ALTER TABLE "approved_members" ADD COLUMN     "inviteError" TEXT,
ADD COLUMN     "inviteExpiresAt" TIMESTAMP(3),
ADD COLUMN     "inviteStatus" "ApprovedMemberInviteStatus" NOT NULL DEFAULT 'NOT_INVITED',
ADD COLUMN     "inviteTokenHash" TEXT,
ADD COLUMN     "invitedAt" TIMESTAMP(3),
ADD COLUMN     "invitedById" TEXT;

-- CreateTable
CREATE TABLE "organization_services" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "category" "ServiceCategory" NOT NULL DEFAULT 'CONSULTATION',
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "isBookable" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "locationType" "AppointmentMode" NOT NULL DEFAULT 'IN_PERSON',
    "defaultLocation" TEXT,
    "instructions" TEXT,
    "assignedStaffIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "referenceCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "serviceId" TEXT,
    "memberId" TEXT,
    "clientName" TEXT NOT NULL,
    "clientEmail" TEXT,
    "clientPhone" TEXT,
    "providerId" TEXT,
    "providerName" TEXT NOT NULL,
    "providerEmail" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "mode" "AppointmentMode" NOT NULL DEFAULT 'IN_PERSON',
    "location" TEXT,
    "meetingUrl" TEXT,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "intakeNotes" TEXT,
    "cancellationReason" TEXT,
    "rescheduledFromId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_calendar_integrations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "googleEmail" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL DEFAULT 'primary',
    "calendarSummary" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "scope" TEXT NOT NULL,
    "syncStatus" "CalendarSyncStatus" NOT NULL DEFAULT 'SYNCED',
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "channelId" TEXT,
    "channelResourceId" TEXT,
    "channelExpiresAt" TIMESTAMP(3),
    "syncToken" TEXT,
    "autoSyncMeetings" BOOLEAN NOT NULL DEFAULT true,
    "autoSyncEvents" BOOLEAN NOT NULL DEFAULT false,
    "autoSyncAppointments" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_calendar_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_calendar_event_mappings" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "externalHtmlLink" TEXT,
    "meetingUrl" TEXT,
    "etag" TEXT,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_calendar_event_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_services_slug_key" ON "organization_services"("slug");

-- CreateIndex
CREATE INDEX "organization_services_active_idx" ON "organization_services"("active");

-- CreateIndex
CREATE INDEX "organization_services_category_idx" ON "organization_services"("category");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_referenceCode_key" ON "appointments"("referenceCode");

-- CreateIndex
CREATE INDEX "appointments_startTime_idx" ON "appointments"("startTime");

-- CreateIndex
CREATE INDEX "appointments_providerId_startTime_idx" ON "appointments"("providerId", "startTime");

-- CreateIndex
CREATE INDEX "appointments_status_idx" ON "appointments"("status");

-- CreateIndex
CREATE INDEX "appointments_memberId_idx" ON "appointments"("memberId");

-- CreateIndex
CREATE INDEX "appointments_serviceId_idx" ON "appointments"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "google_calendar_integrations_userId_key" ON "google_calendar_integrations"("userId");

-- CreateIndex
CREATE INDEX "google_calendar_integrations_userId_idx" ON "google_calendar_integrations"("userId");

-- CreateIndex
CREATE INDEX "external_calendar_event_mappings_entityId_idx" ON "external_calendar_event_mappings"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "external_calendar_event_mappings_integrationId_entityType_e_key" ON "external_calendar_event_mappings"("integrationId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "external_calendar_event_mappings_integrationId_externalEven_key" ON "external_calendar_event_mappings"("integrationId", "externalEventId");

-- CreateIndex
CREATE INDEX "absence_excuses_status_createdAt_idx" ON "absence_excuses"("status", "createdAt");

-- CreateIndex
CREATE INDEX "absence_excuses_memberId_idx" ON "absence_excuses"("memberId");

-- CreateIndex
CREATE INDEX "absence_excuses_memberId_status_idx" ON "absence_excuses"("memberId", "status");

-- CreateIndex
CREATE INDEX "absence_excuses_meetingId_idx" ON "absence_excuses"("meetingId");

-- CreateIndex
CREATE INDEX "absence_excuses_startDate_endDate_idx" ON "absence_excuses"("startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "approved_members_inviteTokenHash_key" ON "approved_members"("inviteTokenHash");

-- CreateIndex
CREATE INDEX "approved_members_inviteStatus_idx" ON "approved_members"("inviteStatus");

-- CreateIndex
CREATE INDEX "attendance_records_meetingId_status_idx" ON "attendance_records"("meetingId", "status");

-- CreateIndex
CREATE INDEX "attendance_records_status_actualArrivalTime_idx" ON "attendance_records"("status", "actualArrivalTime");

-- CreateIndex
CREATE INDEX "chat_messages_roomId_deletedAt_createdAt_idx" ON "chat_messages"("roomId", "deletedAt", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "chat_room_members_roomId_idx" ON "chat_room_members"("roomId");

-- CreateIndex
CREATE INDEX "expenses_status_paidOn_idx" ON "expenses"("status", "paidOn");

-- CreateIndex
CREATE INDEX "expenses_status_incurredOn_idx" ON "expenses"("status", "incurredOn");

-- CreateIndex
CREATE INDEX "expenses_categoryId_status_idx" ON "expenses"("categoryId", "status");

-- CreateIndex
CREATE INDEX "meetings_archivedAt_startTime_idx" ON "meetings"("archivedAt", "startTime");

-- CreateIndex
CREATE INDEX "meetings_status_startTime_idx" ON "meetings"("status", "startTime");

-- CreateIndex
CREATE INDEX "meetings_categoryId_startTime_idx" ON "meetings"("categoryId", "startTime");

-- CreateIndex
CREATE INDEX "meetings_eventTypeId_startTime_idx" ON "meetings"("eventTypeId", "startTime");

-- CreateIndex
CREATE INDEX "member_dues_assignments_periodId_idx" ON "member_dues_assignments"("periodId");

-- CreateIndex
CREATE INDEX "member_dues_assignments_periodId_status_idx" ON "member_dues_assignments"("periodId", "status");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "organization_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_calendar_integrations" ADD CONSTRAINT "google_calendar_integrations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_calendar_event_mappings" ADD CONSTRAINT "external_calendar_event_mappings_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "google_calendar_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- These tables are served exclusively through the authenticated API.
ALTER TABLE "organization_services" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "appointments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "google_calendar_integrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "external_calendar_event_mappings" ENABLE ROW LEVEL SECURITY;
