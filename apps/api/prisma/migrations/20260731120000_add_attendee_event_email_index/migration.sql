-- Supports guest duplicate-registration checks without scanning all event attendees.
CREATE INDEX "attendees_event_id_email_idx" ON "attendees"("event_id", "email");

-- Serializes guest ticket claims by event/email so concurrent checkouts cannot
-- bypass the anti-scalper duplicate guard.
CREATE TABLE "guest_registration_email_claims" (
  "id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "registration_id" TEXT NOT NULL,
  "email_hash" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "guest_registration_email_claims_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guest_registration_email_claims_event_id_email_hash_key"
ON "guest_registration_email_claims"("event_id", "email_hash");

CREATE INDEX "guest_registration_email_claims_registration_id_idx"
ON "guest_registration_email_claims"("registration_id");
