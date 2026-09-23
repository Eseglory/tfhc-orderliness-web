-- AlterTable
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "meetingUrl" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "meeting_agenda_items" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "durationMinutes" INTEGER,
    "assignedMemberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_agenda_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "meeting_agenda_items_meetingId_idx" ON "meeting_agenda_items"("meetingId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "meeting_agenda_items_assignedMemberId_idx" ON "meeting_agenda_items"("assignedMemberId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "meeting_agenda_items_meetingId_order_idx" ON "meeting_agenda_items"("meetingId", "order");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'meeting_agenda_items_meetingId_fkey'
    ) THEN
        ALTER TABLE "meeting_agenda_items" ADD CONSTRAINT "meeting_agenda_items_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'meeting_agenda_items_assignedMemberId_fkey'
    ) THEN
        ALTER TABLE "meeting_agenda_items" ADD CONSTRAINT "meeting_agenda_items_assignedMemberId_fkey" FOREIGN KEY ("assignedMemberId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
