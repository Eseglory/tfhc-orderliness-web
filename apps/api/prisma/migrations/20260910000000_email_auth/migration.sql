-- Email/password authentication for members (gated by the ApprovedMember
-- allowlist), email verification, password reset and session invalidation on
-- password change. Staff already authenticate with a password via the invite
-- flow; this adds self-service email signup + the full password lifecycle.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "passwordAuthEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "emailVerifyTokenHash" TEXT,
ADD COLUMN     "emailVerifyExpiresAt" TIMESTAMP(3),
ADD COLUMN     "passwordResetTokenHash" TEXT,
ADD COLUMN     "passwordResetExpiresAt" TIMESTAMP(3),
ADD COLUMN     "passwordChangedAt" TIMESTAMP(3),
ADD COLUMN     "lastLogoutAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "users_emailVerifyTokenHash_key" ON "users"("emailVerifyTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "users_passwordResetTokenHash_key" ON "users"("passwordResetTokenHash");

-- ---------------------------------------------------------------------------
-- Backfill: existing staff (ADMIN / LEADER) already sign in with a password, so
-- mark them password-enabled and treat their invite acceptance (or account
-- creation) as the point their email was proven. Members are left untouched —
-- passwordAuthEnabled stays false so the Google-only sign-in path is unchanged
-- until a member self-registers.
-- ---------------------------------------------------------------------------
UPDATE "users"
SET "passwordAuthEnabled" = true,
    "emailVerifiedAt" = COALESCE("inviteAcceptedAt", "createdAt"),
    "passwordChangedAt" = COALESCE("inviteAcceptedAt", "createdAt")
WHERE "role" IN ('ADMIN', 'LEADER');
