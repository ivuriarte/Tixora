ALTER TABLE "registrations" ADD COLUMN "partner_consent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "registrations" ADD COLUMN "partner_consent_at" TIMESTAMP(3);
