-- Per-meeting grace periods are a configurable attendance rule (FR-Meet-02).
ALTER TABLE "meetings"
ADD COLUMN "gracePeriodMinutes" INTEGER NOT NULL DEFAULT 10;
