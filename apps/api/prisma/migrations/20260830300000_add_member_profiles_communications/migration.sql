-- Member-managed profile fields remain on the canonical TFHC member record.
ALTER TABLE "members"
  ADD COLUMN "middleName" TEXT,
  ADD COLUMN "preferredName" TEXT,
  ADD COLUMN "profilePhotoUrl" TEXT,
  ADD COLUMN "alternatePhoneNumber" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "dateOfBirth" DATE;

ALTER TABLE "push_devices"
  ADD COLUMN "deviceIdentifier" TEXT,
  ADD COLUMN "appVersion" TEXT,
  ADD COLUMN "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE TYPE "NotificationStatus" AS ENUM ('UNREAD', 'READ');
CREATE TYPE "CommunicationChannel" AS ENUM ('PUSH', 'EMAIL', 'SMS');
CREATE TYPE "CommunicationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TABLE "member_celebration_dates" (
  "id" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "label" TEXT,
  "date" DATE NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "member_celebration_dates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "member_notifications" (
  "id" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "data" JSONB,
  "status" "NotificationStatus" NOT NULL DEFAULT 'UNREAD',
  "readAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "member_notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "member_messages" (
  "id" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "member_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "communication_deliveries" (
  "id" TEXT NOT NULL,
  "notificationId" TEXT,
  "channel" "CommunicationChannel" NOT NULL,
  "recipient" TEXT NOT NULL,
  "templateKey" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "status" "CommunicationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "provider" TEXT,
  "providerRef" TEXT,
  "failureReason" TEXT,
  "attemptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "communication_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "member_celebration_dates_memberId_type_key" ON "member_celebration_dates"("memberId", "type");
CREATE INDEX "member_celebration_dates_type_isActive_idx" ON "member_celebration_dates"("type", "isActive");
CREATE INDEX "member_notifications_memberId_status_createdAt_idx" ON "member_notifications"("memberId", "status", "createdAt");
CREATE INDEX "member_messages_memberId_readAt_createdAt_idx" ON "member_messages"("memberId", "readAt", "createdAt");
CREATE UNIQUE INDEX "communication_deliveries_idempotencyKey_key" ON "communication_deliveries"("idempotencyKey");
CREATE INDEX "communication_deliveries_channel_status_idx" ON "communication_deliveries"("channel", "status");

ALTER TABLE "member_celebration_dates" ADD CONSTRAINT "member_celebration_dates_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member_notifications" ADD CONSTRAINT "member_notifications_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member_messages" ADD CONSTRAINT "member_messages_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "communication_deliveries" ADD CONSTRAINT "communication_deliveries_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "member_notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
