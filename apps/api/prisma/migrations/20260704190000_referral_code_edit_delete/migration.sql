-- Add soft-delete support to referral_codes
ALTER TABLE "referral_codes" ADD COLUMN "deleted_at" TIMESTAMP(3);
