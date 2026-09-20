ALTER TABLE "chat_room_members" ADD COLUMN "lastDeliveredAt" TIMESTAMP(3);
CREATE TABLE "chat_message_reactions" (
  "messageId" TEXT NOT NULL REFERENCES "chat_messages"("id") ON DELETE CASCADE,
  "memberId" TEXT NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
  "emoji" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("messageId", "memberId", "emoji")
);
CREATE INDEX "chat_message_reactions_memberId_idx" ON "chat_message_reactions"("memberId");
CREATE TABLE "chat_message_hidden" (
  "messageId" TEXT NOT NULL REFERENCES "chat_messages"("id") ON DELETE CASCADE,
  "memberId" TEXT NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("messageId", "memberId")
);
CREATE INDEX "chat_message_hidden_memberId_idx" ON "chat_message_hidden"("memberId");
-- Backend-only access, matching the existing Supabase policy.
ALTER TABLE "chat_message_reactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_message_hidden" ENABLE ROW LEVEL SECURITY;
