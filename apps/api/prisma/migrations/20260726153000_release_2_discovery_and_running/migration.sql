-- Axon Tickets Release 2.0 discovery, running-event, profile, consent, and
-- governance foundations. Existing production/UAT records are preserved.

ALTER TABLE "events"
  ADD COLUMN "category" TEXT NOT NULL DEFAULT 'business',
  ADD COLUMN "event_type" TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN "is_online" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "published_at" TIMESTAMP(3),
  ADD COLUMN "running_config" JSONB;

UPDATE "events"
SET "published_at" = COALESCE("updated_at", "created_at")
WHERE "status" IN ('on_sale', 'sold_out', 'completed')
  AND "published_at" IS NULL;

ALTER TABLE "registrations"
  ADD COLUMN "guest_email" TEXT,
  ADD COLUMN "guest_access_token_hash" TEXT,
  ADD COLUMN "account_consent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "account_consent_at" TIMESTAMP(3),
  ADD COLUMN "attendees_completed_at" TIMESTAMP(3);

UPDATE "registrations"
SET "attendees_completed_at" = "created_at"
WHERE EXISTS (
  SELECT 1 FROM "attendees" a WHERE a."registration_id" = "registrations"."id"
);

ALTER TABLE "attendees"
  ADD COLUMN "event_id" TEXT,
  ADD COLUMN "race_distance" TEXT,
  ADD COLUMN "race_division" TEXT,
  ADD COLUMN "gender_identity" TEXT,
  ADD COLUMN "emergency_contact_name" TEXT,
  ADD COLUMN "emergency_contact_phone" TEXT,
  ADD COLUMN "emergency_contact_relationship" TEXT,
  ADD COLUMN "merchandise_size" TEXT,
  ADD COLUMN "claim_method" TEXT,
  ADD COLUMN "delivery_address" JSONB,
  ADD COLUMN "bib_number" TEXT,
  ADD COLUMN "bib_sequence" INTEGER,
  ADD COLUMN "bib_assigned_at" TIMESTAMP(3),
  ADD COLUMN "claimed_at" TIMESTAMP(3);

UPDATE "attendees" a
SET "event_id" = r."event_id"
FROM "registrations" r
WHERE r."id" = a."registration_id";

ALTER TABLE "attendees" ALTER COLUMN "event_id" SET NOT NULL;

ALTER TABLE "organizations"
  ADD COLUMN "public_slug" TEXT,
  ADD COLUMN "logo_url" TEXT,
  ADD COLUMN "social_links" JSONB,
  ADD COLUMN "is_public" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "hidden_at" TIMESTAMP(3),
  ADD COLUMN "profile_updated_at" TIMESTAMP(3);

UPDATE "organizations"
SET "public_slug" = LOWER(
  TRIM(BOTH '-' FROM REGEXP_REPLACE(
    REGEXP_REPLACE("name", '[^a-zA-Z0-9]+', '-', 'g'),
    '-+', '-', 'g'
  ))
) || '-' || LEFT("id", 6)
WHERE "public_slug" IS NULL;

CREATE TABLE "race_bib_counters" (
  "id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "distance" TEXT NOT NULL,
  "next_value" INTEGER NOT NULL DEFAULT 1,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "race_bib_counters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organizations_public_slug_key" ON "organizations"("public_slug");
CREATE INDEX "organizations_is_public_approval_status_idx" ON "organizations"("is_public", "approval_status");
CREATE INDEX "events_category_status_starts_at_idx" ON "events"("category", "status", "starts_at");
CREATE INDEX "events_event_type_status_idx" ON "events"("event_type", "status");
CREATE INDEX "events_published_at_idx" ON "events"("published_at");
CREATE INDEX "registrations_guest_email_status_idx" ON "registrations"("guest_email", "status");
CREATE INDEX "attendees_event_id_race_distance_idx" ON "attendees"("event_id", "race_distance");
CREATE INDEX "attendees_created_at_idx" ON "attendees"("created_at");
CREATE INDEX "payment_proofs_created_at_idx" ON "payment_proofs"("created_at");
CREATE UNIQUE INDEX "attendees_event_id_race_distance_bib_sequence_key"
  ON "attendees"("event_id", "race_distance", "bib_sequence");
CREATE UNIQUE INDEX "race_bib_counters_event_id_distance_key"
  ON "race_bib_counters"("event_id", "distance");
CREATE INDEX "race_bib_counters_event_id_idx" ON "race_bib_counters"("event_id");

ALTER TABLE "attendees"
  ADD CONSTRAINT "attendees_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "race_bib_counters"
  ADD CONSTRAINT "race_bib_counters_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
