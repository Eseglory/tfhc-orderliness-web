-- Proposed production repair. Execute only after specific approval.
-- Run indexes outside a transaction. Limits avoid prolonged production waits.
SET lock_timeout = '5s';
SET statement_timeout = '60s';
ALTER TABLE "service_schedule_exceptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "approval_workflows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "approval_steps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "approval_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "approval_actions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "welfare_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expense_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dues_periods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "member_dues_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_rooms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_room_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_messages" ENABLE ROW LEVEL SECURITY;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "chat_messages_roomId_createdAt_desc_idx" ON "chat_messages"("roomId", "createdAt" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "chat_messages_active_roomId_createdAt_idx" ON "chat_messages"("roomId", "createdAt" DESC) WHERE "deletedAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "chat_room_members_active_memberId_idx" ON "chat_room_members"("memberId") WHERE "leftAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "chat_room_members_active_roomId_idx" ON "chat_room_members"("roomId") WHERE "leftAt" IS NULL;
ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pwa_device_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "resumable_uploads" ENABLE ROW LEVEL SECURITY;
