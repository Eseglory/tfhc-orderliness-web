-- Create composite index on (roomId, createdAt DESC)
CREATE INDEX IF NOT EXISTS "chat_messages_roomId_createdAt_desc_idx" ON "chat_messages"("roomId", "createdAt" DESC);

-- Create partial index for non-deleted active messages
CREATE INDEX IF NOT EXISTS "chat_messages_active_roomId_createdAt_idx" ON "chat_messages"("roomId", "createdAt" DESC) WHERE "deletedAt" IS NULL;

-- Create partial indexes for active room memberships
CREATE INDEX IF NOT EXISTS "chat_room_members_active_memberId_idx" ON "chat_room_members"("memberId") WHERE "leftAt" IS NULL;
CREATE INDEX IF NOT EXISTS "chat_room_members_active_roomId_idx" ON "chat_room_members"("roomId") WHERE "leftAt" IS NULL;
