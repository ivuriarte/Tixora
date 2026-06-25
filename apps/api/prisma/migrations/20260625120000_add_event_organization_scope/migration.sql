-- Add organization ownership to events for multi-member organizer access.
-- The column stays nullable so legacy platform/admin-created events remain valid.
ALTER TABLE "events" ADD COLUMN "organization_id" TEXT;

-- Backfill events created by organization owners to their most recent organization.
-- If a creator owns multiple organizations, prefer approved, then newest.
UPDATE "events" e
SET "organization_id" = owner_org."organization_id"
FROM (
  SELECT DISTINCT ON (om."user_id")
    om."user_id",
    om."organization_id"
  FROM "organization_members" om
  INNER JOIN "organizations" o ON o."id" = om."organization_id"
  WHERE om."role" = 'owner'
  ORDER BY
    om."user_id",
    CASE o."approval_status" WHEN 'approved' THEN 0 ELSE 1 END,
    o."created_at" DESC
) owner_org
WHERE e."created_by_id" = owner_org."user_id"
  AND e."organization_id" IS NULL;

CREATE INDEX "events_organization_id_idx" ON "events"("organization_id");

ALTER TABLE "events" ADD CONSTRAINT "events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
