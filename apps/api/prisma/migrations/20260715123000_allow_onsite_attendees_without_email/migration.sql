-- This migration only relaxes nullability; it does not remove data.
--
-- Rollback precondition (both results must be zero):
--   SELECT COUNT(*) FROM "registrations" WHERE "user_id" IS NULL;
--   SELECT COUNT(*) FROM "attendees" WHERE "email" IS NULL;
-- Rollback SQL:
--   ALTER TABLE "registrations" ALTER COLUMN "user_id" SET NOT NULL;
--   ALTER TABLE "attendees" ALTER COLUMN "email" SET NOT NULL;

ALTER TABLE "registrations"
  ALTER COLUMN "user_id" DROP NOT NULL;

ALTER TABLE "attendees"
  ALTER COLUMN "email" DROP NOT NULL;
