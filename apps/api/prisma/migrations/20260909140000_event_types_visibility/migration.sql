-- CreateEnum
CREATE TYPE "EventVisibility" AS ENUM ('PUBLIC', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "EventAudienceScope" AS ENUM ('ALL_MEMBERS', 'EXECUTIVES', 'ADMINS');

-- CreateEnum
CREATE TYPE "EventInvitationStatus" AS ENUM ('INVITED', 'ACCEPTED', 'DECLINED', 'TENTATIVE', 'NO_RESPONSE');

-- AlterTable
ALTER TABLE "meeting_categories" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isSystem" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "meetings" ADD COLUMN     "address" TEXT,
ADD COLUMN     "allDay" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "coverImageUrl" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "eventTypeId" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "organizerName" TEXT,
ADD COLUMN     "visibility" "EventVisibility" NOT NULL DEFAULT 'PUBLIC';

-- AlterTable
ALTER TABLE "sub_teams" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isSystem" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "event_types" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "defaultCompulsory" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_audiences" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "scope" "EventAudienceScope",
    "memberId" TEXT,
    "subTeamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_audiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_invitations" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "status" "EventInvitationStatus" NOT NULL DEFAULT 'INVITED',
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_types_key_key" ON "event_types"("key");

-- CreateIndex
CREATE INDEX "event_audiences_meetingId_idx" ON "event_audiences"("meetingId");

-- CreateIndex
CREATE INDEX "event_audiences_memberId_idx" ON "event_audiences"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "event_audiences_meetingId_scope_memberId_subTeamId_key" ON "event_audiences"("meetingId", "scope", "memberId", "subTeamId");

-- CreateIndex
CREATE INDEX "event_invitations_memberId_status_idx" ON "event_invitations"("memberId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "event_invitations_meetingId_memberId_key" ON "event_invitations"("meetingId", "memberId");

-- CreateIndex
CREATE INDEX "meetings_eventTypeId_idx" ON "meetings"("eventTypeId");

-- CreateIndex
CREATE INDEX "meetings_visibility_startTime_idx" ON "meetings"("visibility", "startTime");

-- AddForeignKey
ALTER TABLE "event_audiences" ADD CONSTRAINT "event_audiences_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_audiences" ADD CONSTRAINT "event_audiences_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_audiences" ADD CONSTRAINT "event_audiences_subTeamId_fkey" FOREIGN KEY ("subTeamId") REFERENCES "sub_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_invitations" ADD CONSTRAINT "event_invitations_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_invitations" ADD CONSTRAINT "event_invitations_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "event_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- RLS parity.
ALTER TABLE "event_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "event_audiences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "event_invitations" ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Seed default event types (kept in sync with @tfhc/shared on boot).
-- ---------------------------------------------------------------------------
INSERT INTO "event_types" ("id","key","name","description","icon","color","defaultCompulsory","isSystem","active","sortOrder","createdAt","updatedAt")
VALUES
  (gen_random_uuid(),'SERVICE','Service','Regular worship services','church','#0F172A',true,true,true,10,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'MEETING','Meeting','Unit, executive, committee and general meetings','groups','#2563EB',true,true,true,20,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'TRAINING','Training','Leadership training, seminars and workshops','school','#7C3AED',true,true,true,30,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'PRAYER','Prayer Meeting','Prayer meetings and vigils','volunteer_activism','#0891B2',false,true,true,40,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'BIBLE_STUDY','Bible Study','Bible study and discipleship classes','menu_book','#059669',false,true,true,50,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'SPECIAL_SERVICE','Special Service','Conventions, crusades and special programmes','auto_awesome','#D97706',true,true,true,60,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'OUTREACH','Outreach','Evangelism and community outreach','diversity_3','#DB2777',false,true,true,70,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'WEDDING','Wedding','Wedding ceremonies and receptions','favorite','#E11D48',false,true,true,80,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'FUNERAL','Funeral','Funeral and memorial services','local_florist','#475569',false,true,true,90,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'CELEBRATION','Celebration','Birthdays, anniversaries, parties and thanksgiving','celebration','#F59E0B',false,true,true,100,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'OTHER','Other','Any other church activity','event','#64748B',false,true,true,110,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- Existing system meeting categories become non-deletable.
UPDATE "meeting_categories" SET "isSystem" = true
WHERE "name" IN ('Unit Meeting','Sunday Service','Midweek Service','Training','Special Programme');

UPDATE "sub_teams" SET "isSystem" = true;

-- Backfill meetings.eventTypeId from the legacy category name.
UPDATE "meetings" m SET "eventTypeId" = t."id"
FROM "meeting_categories" c, "event_types" t
WHERE m."categoryId" = c."id" AND m."eventTypeId" IS NULL AND t."key" = (
  CASE
    WHEN c."name" IN ('Sunday Service','Midweek Service') THEN 'SERVICE'
    WHEN c."name" IN ('Unit Meeting','Executive Meeting','General Meeting','Committee Meeting') THEN 'MEETING'
    WHEN c."name" IN ('Training','Seminar') THEN 'TRAINING'
    WHEN c."name" IN ('Special Programme','Conference') THEN 'SPECIAL_SERVICE'
    ELSE 'OTHER'
  END
);
