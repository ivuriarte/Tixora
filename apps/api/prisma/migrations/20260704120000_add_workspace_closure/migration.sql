-- Add explicit workspace closure with a locked readiness snapshot.
-- All columns are nullable and additive; existing rows mean "not yet closed".
ALTER TABLE "event_workspaces"
  ADD COLUMN "closed_at" TIMESTAMP(3),
  ADD COLUMN "closed_by_id" TEXT,
  ADD COLUMN "readiness_snapshot" JSONB;

ALTER TABLE "event_workspaces" ADD CONSTRAINT "event_workspaces_closed_by_id_fkey"
  FOREIGN KEY ("closed_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
