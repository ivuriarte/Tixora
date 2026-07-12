-- Migration: remove 'published' status, add max_capacity field

-- Step 1: Move any published events to draft
UPDATE "events" SET "status" = 'draft' WHERE "status" = 'published';

-- Step 2: Drop the default on the status column before altering its type
ALTER TABLE "events" ALTER COLUMN "status" DROP DEFAULT;

-- Step 3: Recreate EventStatus enum without 'published'
ALTER TYPE "EventStatus" RENAME TO "EventStatus_old";
CREATE TYPE "EventStatus" AS ENUM ('draft', 'on_sale', 'sold_out', 'cancelled', 'completed');
ALTER TABLE "events" ALTER COLUMN "status" TYPE "EventStatus" USING "status"::text::"EventStatus";
DROP TYPE "EventStatus_old";

-- Step 4: Restore the default
ALTER TABLE "events" ALTER COLUMN "status" SET DEFAULT 'draft'::"EventStatus";

-- Step 5: Add max_capacity column (nullable — existing events have no capacity set)
ALTER TABLE "events" ADD COLUMN "max_capacity" INTEGER;
