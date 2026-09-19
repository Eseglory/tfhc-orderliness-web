-- CreateTable
CREATE TABLE "service_headcounts" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "totalHeadcount" INTEGER NOT NULL,
    "maleCount" INTEGER,
    "femaleCount" INTEGER,
    "childrenCount" INTEGER,
    "notes" TEXT,
    "recordedById" TEXT NOT NULL,
    "lastUpdatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_headcounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_headcounts_meetingId_key" ON "service_headcounts"("meetingId");

-- CreateIndex
CREATE INDEX "service_headcounts_meetingId_idx" ON "service_headcounts"("meetingId");

-- CreateIndex
CREATE INDEX "service_headcounts_recordedById_idx" ON "service_headcounts"("recordedById");

-- CreateIndex
CREATE INDEX "service_headcounts_createdAt_idx" ON "service_headcounts"("createdAt");

-- AddForeignKey
ALTER TABLE "service_headcounts" ADD CONSTRAINT "service_headcounts_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_headcounts" ADD CONSTRAINT "service_headcounts_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_headcounts" ADD CONSTRAINT "service_headcounts_lastUpdatedById_fkey" FOREIGN KEY ("lastUpdatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
