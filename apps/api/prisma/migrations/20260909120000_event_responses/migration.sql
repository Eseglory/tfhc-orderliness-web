CREATE TABLE "event_responses" (
 "id" TEXT NOT NULL, "memberId" TEXT NOT NULL, "meetingId" TEXT NOT NULL,
 "attending" BOOLEAN NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "event_responses_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "event_responses_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "event_responses_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "event_responses_memberId_meetingId_key" ON "event_responses"("memberId", "meetingId");
CREATE INDEX "event_responses_meetingId_attending_idx" ON "event_responses"("meetingId", "attending");
ALTER TABLE "event_responses" ENABLE ROW LEVEL SECURITY;
