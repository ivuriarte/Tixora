ALTER TABLE "registrations"
  ALTER COLUMN "user_id" DROP NOT NULL;

ALTER TABLE "attendees"
  ALTER COLUMN "email" DROP NOT NULL;
