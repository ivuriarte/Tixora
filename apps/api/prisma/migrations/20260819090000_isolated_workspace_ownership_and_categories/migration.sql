-- Additive workspace upgrade. Existing checklist rows are preserved.
CREATE TABLE "workspace_categories" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workspace_categories_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "workspace_items"
  ADD COLUMN "category_id" TEXT,
  ADD COLUMN "assigned_to_user_id" TEXT,
  ADD COLUMN "accountable_to_user_id" TEXT;

-- Turn each existing string category into a real category without deleting or
-- rewriting any checklist item.
INSERT INTO "workspace_categories" ("id", "workspace_id", "name", "sort_order")
SELECT gen_random_uuid()::text,
       grouped."workspace_id",
       grouped."name",
       grouped."sort_order"::integer
FROM (
  SELECT "workspace_id",
         COALESCE(NULLIF(BTRIM("category"), ''), 'General') AS "name",
         DENSE_RANK() OVER (
           PARTITION BY "workspace_id"
           ORDER BY MIN("sort_order"), COALESCE(NULLIF(BTRIM("category"), ''), 'General')
         ) - 1 AS "sort_order"
  FROM "workspace_items"
  GROUP BY "workspace_id", COALESCE(NULLIF(BTRIM("category"), ''), 'General')
) grouped;

UPDATE "workspace_items" item
SET "category_id" = category."id",
    "category" = category."name"
FROM "workspace_categories" category
WHERE category."workspace_id" = item."workspace_id"
  AND category."name" = COALESCE(NULLIF(BTRIM(item."category"), ''), 'General');

-- Safely resolve legacy text assignments only when exactly one verified member
-- in the event organization matches the stored email or display name.
WITH responsible_candidates AS (
  SELECT item."id" AS item_id,
         MIN(member."user_id") AS user_id,
         COUNT(*) AS candidate_count
  FROM "workspace_items" item
  JOIN "event_workspaces" workspace ON workspace."id" = item."workspace_id"
  JOIN "events" event ON event."id" = workspace."event_id"
  JOIN "organization_members" member ON member."organization_id" = event."organization_id"
  JOIN "users" app_user ON app_user."id" = member."user_id" AND app_user."is_verified" = true
  WHERE item."assigned_to_name" IS NOT NULL
    AND (
      LOWER(app_user."email") = LOWER(BTRIM(item."assigned_to_name"))
      OR LOWER(BTRIM(CONCAT_WS(' ', app_user."first_name", app_user."last_name"))) = LOWER(BTRIM(item."assigned_to_name"))
    )
  GROUP BY item."id"
)
UPDATE "workspace_items" item
SET "assigned_to_user_id" = candidate.user_id
FROM responsible_candidates candidate
WHERE item."id" = candidate.item_id AND candidate.candidate_count = 1;

WITH accountable_candidates AS (
  SELECT item."id" AS item_id,
         MIN(member."user_id") AS user_id,
         COUNT(*) AS candidate_count
  FROM "workspace_items" item
  JOIN "event_workspaces" workspace ON workspace."id" = item."workspace_id"
  JOIN "events" event ON event."id" = workspace."event_id"
  JOIN "organization_members" member ON member."organization_id" = event."organization_id"
  JOIN "users" app_user ON app_user."id" = member."user_id" AND app_user."is_verified" = true
  WHERE item."accountable_name" IS NOT NULL
    AND (
      LOWER(app_user."email") = LOWER(BTRIM(item."accountable_name"))
      OR LOWER(BTRIM(CONCAT_WS(' ', app_user."first_name", app_user."last_name"))) = LOWER(BTRIM(item."accountable_name"))
    )
  GROUP BY item."id"
)
UPDATE "workspace_items" item
SET "accountable_to_user_id" = candidate.user_id
FROM accountable_candidates candidate
WHERE item."id" = candidate.item_id AND candidate.candidate_count = 1;

CREATE TABLE "workspace_reminder_deliveries" (
    "id" TEXT NOT NULL,
    "workspace_item_id" TEXT NOT NULL,
    "recipient_user_id" TEXT NOT NULL,
    "reminder_key" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workspace_reminder_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_categories_workspace_id_name_key" ON "workspace_categories"("workspace_id", "name");
CREATE INDEX "workspace_categories_workspace_id_sort_order_idx" ON "workspace_categories"("workspace_id", "sort_order");
CREATE INDEX "workspace_items_category_id_idx" ON "workspace_items"("category_id");
CREATE INDEX "workspace_items_assigned_to_user_id_idx" ON "workspace_items"("assigned_to_user_id");
CREATE INDEX "workspace_items_accountable_to_user_id_idx" ON "workspace_items"("accountable_to_user_id");
CREATE UNIQUE INDEX "workspace_reminder_deliveries_item_recipient_key" ON "workspace_reminder_deliveries"("workspace_item_id", "recipient_user_id", "reminder_key");
CREATE INDEX "workspace_reminder_deliveries_recipient_sent_idx" ON "workspace_reminder_deliveries"("recipient_user_id", "sent_at");

ALTER TABLE "workspace_categories" ADD CONSTRAINT "workspace_categories_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "event_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_items" ADD CONSTRAINT "workspace_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "workspace_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_items" ADD CONSTRAINT "workspace_items_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "workspace_items" ADD CONSTRAINT "workspace_items_accountable_to_user_id_fkey" FOREIGN KEY ("accountable_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "workspace_reminder_deliveries" ADD CONSTRAINT "workspace_reminder_deliveries_workspace_item_id_fkey" FOREIGN KEY ("workspace_item_id") REFERENCES "workspace_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_reminder_deliveries" ADD CONSTRAINT "workspace_reminder_deliveries_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
