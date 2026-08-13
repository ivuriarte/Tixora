-- Immutable running-event age classification and explicit analytics exclusions.
ALTER TABLE "attendees"
  ADD COLUMN "age_at_event" INTEGER,
  ADD COLUMN "age_group_name" TEXT;

ALTER TABLE "users" ADD COLUMN "is_test" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "events" ADD COLUMN "is_test" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "organizations" ADD COLUMN "is_test" BOOLEAN NOT NULL DEFAULT false;

-- Existing deterministic UAT fixtures pre-date the explicit test marker.
-- Backfill only the exact seed identities so production-like records are never
-- excluded through brittle title or email-pattern heuristics at query time.
UPDATE "users"
SET "is_test" = true
WHERE "email" IN ('testuser1@axon.uat', 'testuser2@axon.uat');

UPDATE "events"
SET "is_test" = true
WHERE "slug" IN ('uat-leadership-conference-2026', 'uat-fun-run-2026');

UPDATE "organizations"
SET "is_test" = true
WHERE "name" = 'Axon Tickets Platform'
  AND "id_number" = 'PLATFORM-UAT';

CREATE INDEX "attendees_event_id_age_group_name_idx"
  ON "attendees"("event_id", "age_group_name");

CREATE INDEX "users_is_test_created_at_idx" ON "users"("is_test", "created_at");
CREATE INDEX "events_is_test_status_starts_at_idx" ON "events"("is_test", "status", "starts_at");
CREATE INDEX "organizations_is_test_approval_status_idx" ON "organizations"("is_test", "approval_status");
CREATE INDEX "orders_status_created_at_idx" ON "orders"("status", "created_at");
CREATE INDEX "registrations_status_verified_at_idx" ON "registrations"("status", "verified_at");
