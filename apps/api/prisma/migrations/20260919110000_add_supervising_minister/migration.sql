-- AlterTable
ALTER TABLE "meetings" ADD COLUMN "supervisingMinisterId" TEXT;

-- CreateIndex
CREATE INDEX "meetings_supervisingMinisterId_idx" ON "meetings"("supervisingMinisterId");

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_supervisingMinisterId_fkey" FOREIGN KEY ("supervisingMinisterId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
