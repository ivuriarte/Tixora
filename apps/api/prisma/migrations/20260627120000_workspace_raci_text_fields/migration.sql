-- Replace FK-based RACI user references with free-text name fields

ALTER TABLE "workspace_items"
  ADD COLUMN "assigned_to_name" TEXT,
  ADD COLUMN "accountable_name" TEXT;

-- Backfill text names from user records
UPDATE "workspace_items" wi
SET "assigned_to_name" = TRIM(CONCAT(COALESCE(u."first_name", ''), ' ', COALESCE(u."last_name", '')))
FROM "users" u
WHERE wi."assigned_to_id" = u."id"
  AND (u."first_name" IS NOT NULL OR u."last_name" IS NOT NULL);

UPDATE "workspace_items" wi
SET "accountable_name" = TRIM(CONCAT(COALESCE(u."first_name", ''), ' ', COALESCE(u."last_name", '')))
FROM "users" u
WHERE wi."accountable_id" = u."id"
  AND (u."first_name" IS NOT NULL OR u."last_name" IS NOT NULL);

-- Drop the FK columns
ALTER TABLE "workspace_items"
  DROP COLUMN IF EXISTS "assigned_to_id",
  DROP COLUMN IF EXISTS "accountable_id";
