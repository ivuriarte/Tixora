CREATE TYPE "ReferralDiscountType" AS ENUM ('percentage', 'fixed_amount');

ALTER TABLE "users"
  ADD COLUMN "birthday" DATE,
  ADD COLUMN "gender" TEXT;

ALTER TABLE "attendees"
  ADD COLUMN "birthday" DATE,
  ADD COLUMN "gender" TEXT,
  ADD COLUMN "city" TEXT;

ALTER TABLE "events"
  ADD COLUMN "custom_sections" JSONB;

CREATE TABLE "referral_codes" (
  "id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "discount_type" "ReferralDiscountType" NOT NULL,
  "discount_value" DECIMAL(10,2) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "max_uses" INTEGER,
  "valid_from" TIMESTAMP(3),
  "valid_until" TIMESTAMP(3),
  "applicable_tier_ids" JSONB,
  "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deactivated_at" TIMESTAMP(3),
  CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "registrations"
  ADD COLUMN "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "referral_code_id" TEXT,
  ADD COLUMN "referral_code_snapshot" JSONB;

CREATE TABLE "referral_code_usages" (
  "id" TEXT NOT NULL,
  "referral_code_id" TEXT NOT NULL,
  "registration_id" TEXT NOT NULL,
  "discount_amount" DECIMAL(10,2) NOT NULL,
  "attendee_count" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "referral_code_usages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "referral_codes_event_id_code_key" ON "referral_codes"("event_id", "code");
CREATE INDEX "referral_codes_event_id_is_active_idx" ON "referral_codes"("event_id", "is_active");
CREATE UNIQUE INDEX "referral_code_usages_registration_id_key" ON "referral_code_usages"("registration_id");
CREATE INDEX "referral_code_usages_referral_code_id_created_at_idx" ON "referral_code_usages"("referral_code_id", "created_at");

ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_referral_code_id_fkey" FOREIGN KEY ("referral_code_id") REFERENCES "referral_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "referral_code_usages" ADD CONSTRAINT "referral_code_usages_referral_code_id_fkey" FOREIGN KEY ("referral_code_id") REFERENCES "referral_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "referral_code_usages" ADD CONSTRAINT "referral_code_usages_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
