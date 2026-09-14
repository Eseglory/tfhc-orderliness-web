-- Match the existing backend-only database access model. The API table owner
-- enforces authentication; Supabase anon/authenticated roles receive no policies.
ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pwa_device_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "resumable_uploads" ENABLE ROW LEVEL SECURITY;
