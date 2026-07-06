-- Add latitude and longitude to events table.
-- These columns exist in production via manual SQL but were missing from migrations (schema drift).
-- Using IF NOT EXISTS so this is safe to apply against production as well.
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "latitude" DECIMAL(10,7);
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "longitude" DECIMAL(10,7);
