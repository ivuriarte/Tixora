ALTER TABLE "events"
ADD COLUMN "is_free" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ticket_tier_inclusions" (
  "id" TEXT NOT NULL,
  "tier_id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "stub_enabled" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ticket_tier_inclusions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ticket_tier_inclusions_tier_id_label_key"
ON "ticket_tier_inclusions"("tier_id", "label");

CREATE INDEX "ticket_tier_inclusions_tier_id_sort_order_idx"
ON "ticket_tier_inclusions"("tier_id", "sort_order");

ALTER TABLE "ticket_tier_inclusions"
ADD CONSTRAINT "ticket_tier_inclusions_tier_id_fkey"
FOREIGN KEY ("tier_id") REFERENCES "ticket_tiers"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
