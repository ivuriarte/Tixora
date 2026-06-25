-- Add missing performance indexes identified during production hardening (Phase 2, Task 3)

-- registrations: tier-based capacity checks and admin tier-filtered views
CREATE INDEX "registrations_tier_id_status_idx" ON "registrations"("tier_id", "status");

-- registrations: admin dashboard ordered by recent pending submissions
CREATE INDEX "registrations_status_created_at_idx" ON "registrations"("status", "created_at" DESC);

-- tickets: tier-level ticket validation queries (check-in scanner)
CREATE INDEX "tickets_ticket_tier_id_status_idx" ON "tickets"("ticket_tier_id", "status");

-- registration_funnel_events: user-specific funnel history (re-entry detection, support lookups)
CREATE INDEX "registration_funnel_events_user_id_idx" ON "registration_funnel_events"("user_id");
