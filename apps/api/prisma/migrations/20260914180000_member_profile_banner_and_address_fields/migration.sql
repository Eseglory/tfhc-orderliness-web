-- Add banner photo and extended address/location fields to members table
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "bannerPhotoUrl" TEXT;
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "state" TEXT;
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "country" TEXT;
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "postalCode" TEXT;
