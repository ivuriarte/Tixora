-- Add featured event fields to events table
-- Safe: uses IF NOT EXISTS so re-running is idempotent

ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "tagline" TEXT,
  ADD COLUMN IF NOT EXISTS "is_featured" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "featured_order" INTEGER,
  ADD COLUMN IF NOT EXISTS "featured_until" TIMESTAMPTZ;

-- Index for fast featured-event queries (only rows with is_featured = true)
CREATE INDEX IF NOT EXISTS "events_is_featured_featured_order_idx"
  ON "events" ("is_featured", "featured_order")
  WHERE "is_featured" = TRUE;
