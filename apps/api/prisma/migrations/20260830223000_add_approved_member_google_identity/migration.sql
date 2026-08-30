CREATE TYPE "ApprovedMemberStatus" AS ENUM ('ACTIVE', 'REVOKED');
ALTER TABLE "users" ADD COLUMN "googleSubject" TEXT;
CREATE UNIQUE INDEX "users_googleSubject_key" ON "users"("googleSubject");
CREATE TABLE "approved_members" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "normalizedEmail" TEXT NOT NULL,
  "status" "ApprovedMemberStatus" NOT NULL DEFAULT 'ACTIVE',
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "importedAt" TIMESTAMP(3),
  "importedBy" TEXT,
  "memberId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "approved_members_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "approved_members_normalizedEmail_key" ON "approved_members"("normalizedEmail");
CREATE UNIQUE INDEX "approved_members_memberId_key" ON "approved_members"("memberId");
CREATE INDEX "approved_members_status_idx" ON "approved_members"("status");
ALTER TABLE "approved_members" ADD CONSTRAINT "approved_members_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
