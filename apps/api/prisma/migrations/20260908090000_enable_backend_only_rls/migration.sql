-- The NestJS backend connects as the table owner and enforces application authorization.
-- No Data API policies are granted: Supabase anon/authenticated roles must not bypass it.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sub_teams" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "meeting_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "meetings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "absence_excuses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "correction_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "follow_up_flags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "meeting_summaries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "system_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "push_devices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "approved_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "member_celebration_dates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "member_notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "member_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "communication_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "weekly_availability_cycles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "member_service_commitments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "weekly_availability_responses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
