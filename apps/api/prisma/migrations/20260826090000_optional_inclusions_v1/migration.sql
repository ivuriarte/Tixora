-- Optional Inclusions v1 is additive. Existing ticket-tier inclusions remain
-- descriptive benefits and are intentionally not migrated into saleable items.

CREATE TYPE "EventInclusionStatus" AS ENUM ('draft', 'active', 'archived');
CREATE TYPE "InclusionFulfillmentMethod" AS ENUM ('pickup', 'delivery', 'digital', 'manual');
CREATE TYPE "CheckoutQuoteStatus" AS ENUM ('active', 'consumed', 'expired', 'cancelled');
CREATE TYPE "RegistrationLineItemKind" AS ENUM ('admission', 'inclusion', 'fee', 'discount');
CREATE TYPE "InclusionReservationStatus" AS ENUM ('reserved', 'confirmed', 'released', 'expired');
CREATE TYPE "InclusionInventoryMovementType" AS ENUM ('reserve', 'confirm', 'release', 'expire', 'adjust', 'fulfill', 'reverse', 'refund');
CREATE TYPE "InclusionFulfillmentStatus" AS ENUM ('pending', 'fulfilled', 'reversed', 'cancelled');

ALTER TABLE "events"
  ADD COLUMN "optional_inclusions_enabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "event_inclusions" (
  "id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "EventInclusionStatus" NOT NULL DEFAULT 'draft',
  "sale_starts_at" TIMESTAMP(3),
  "sale_ends_at" TIMESTAMP(3),
  "fulfillment_method" "InclusionFulfillmentMethod" NOT NULL DEFAULT 'pickup',
  "fulfillment_instructions" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "archived_at" TIMESTAMP(3),
  CONSTRAINT "event_inclusions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_inclusions_sale_window_check"
    CHECK ("sale_starts_at" IS NULL OR "sale_ends_at" IS NULL OR "sale_starts_at" < "sale_ends_at")
);

CREATE TABLE "inclusion_variants" (
  "id" TEXT NOT NULL,
  "inclusion_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sku" TEXT,
  "price" DECIMAL(10,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'PHP',
  "total_stock" INTEGER NOT NULL,
  "reserved_stock" INTEGER NOT NULL DEFAULT 0,
  "sold_stock" INTEGER NOT NULL DEFAULT 0,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inclusion_variants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inclusion_variants_price_check" CHECK ("price" >= 0),
  CONSTRAINT "inclusion_variants_stock_check"
    CHECK ("total_stock" >= 0 AND "reserved_stock" >= 0 AND "sold_stock" >= 0 AND "reserved_stock" + "sold_stock" <= "total_stock")
);

CREATE TABLE "inclusion_tier_eligibility" (
  "inclusion_id" TEXT NOT NULL,
  "ticket_tier_id" TEXT NOT NULL,
  "max_quantity_per_registration" INTEGER,
  CONSTRAINT "inclusion_tier_eligibility_pkey" PRIMARY KEY ("inclusion_id", "ticket_tier_id"),
  CONSTRAINT "inclusion_tier_eligibility_max_check"
    CHECK ("max_quantity_per_registration" IS NULL OR "max_quantity_per_registration" > 0)
);

CREATE TABLE "checkout_quotes" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "ticket_tier_id" TEXT NOT NULL,
  "user_id" TEXT,
  "registration_id" TEXT,
  "status" "CheckoutQuoteStatus" NOT NULL DEFAULT 'active',
  "attendee_count" INTEGER NOT NULL,
  "admission_subtotal" DECIMAL(10,2) NOT NULL,
  "inclusion_subtotal" DECIMAL(10,2) NOT NULL,
  "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "fees" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(10,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'PHP',
  "referral_code" TEXT,
  "pricing_snapshot" JSONB NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "checkout_quotes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "checkout_quotes_amounts_check"
    CHECK ("attendee_count" > 0 AND "admission_subtotal" >= 0 AND "inclusion_subtotal" >= 0 AND "discount" >= 0 AND "fees" >= 0 AND "total" >= 0)
);

CREATE TABLE "registration_line_items" (
  "id" TEXT NOT NULL,
  "registration_id" TEXT NOT NULL,
  "kind" "RegistrationLineItemKind" NOT NULL,
  "source_id" TEXT,
  "name_snapshot" TEXT NOT NULL,
  "variant_snapshot" TEXT,
  "assigned_attendee_id" TEXT,
  "quantity" INTEGER NOT NULL,
  "unit_price" DECIMAL(10,2) NOT NULL,
  "total" DECIMAL(10,2) NOT NULL,
  "fulfillment_method_snapshot" "InclusionFulfillmentMethod",
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "registration_line_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "registration_line_items_quantity_check" CHECK ("quantity" > 0)
);

CREATE TABLE "inclusion_inventory_reservations" (
  "id" TEXT NOT NULL,
  "registration_id" TEXT NOT NULL,
  "quote_id" TEXT,
  "line_item_id" TEXT NOT NULL,
  "variant_id" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "status" "InclusionReservationStatus" NOT NULL DEFAULT 'reserved',
  "expires_at" TIMESTAMP(3) NOT NULL,
  "confirmed_at" TIMESTAMP(3),
  "released_at" TIMESTAMP(3),
  "rejection_grace_until" TIMESTAMP(3),
  "idempotency_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inclusion_inventory_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inclusion_inventory_reservations_quantity_check" CHECK ("quantity" > 0)
);

CREATE TABLE "inclusion_inventory_movements" (
  "id" TEXT NOT NULL,
  "variant_id" TEXT NOT NULL,
  "reservation_id" TEXT,
  "type" "InclusionInventoryMovementType" NOT NULL,
  "quantity" INTEGER NOT NULL,
  "reason" TEXT,
  "actor_id" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inclusion_inventory_movements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inclusion_inventory_movements_quantity_check" CHECK ("quantity" <> 0)
);

CREATE TABLE "inclusion_fulfillments" (
  "id" TEXT NOT NULL,
  "line_item_id" TEXT NOT NULL,
  "status" "InclusionFulfillmentStatus" NOT NULL DEFAULT 'pending',
  "quantity" INTEGER NOT NULL,
  "fulfilled_by_id" TEXT,
  "fulfilled_at" TIMESTAMP(3),
  "reversed_by_id" TEXT,
  "reversed_at" TIMESTAMP(3),
  "reversal_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inclusion_fulfillments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inclusion_fulfillments_quantity_check" CHECK ("quantity" > 0)
);

CREATE INDEX "event_inclusions_event_id_status_sort_order_idx" ON "event_inclusions"("event_id", "status", "sort_order");
CREATE UNIQUE INDEX "inclusion_variants_inclusion_id_name_key" ON "inclusion_variants"("inclusion_id", "name");
CREATE UNIQUE INDEX "inclusion_variants_inclusion_id_sku_key" ON "inclusion_variants"("inclusion_id", "sku");
CREATE INDEX "inclusion_variants_inclusion_id_is_active_sort_order_idx" ON "inclusion_variants"("inclusion_id", "is_active", "sort_order");
CREATE INDEX "inclusion_tier_eligibility_ticket_tier_id_idx" ON "inclusion_tier_eligibility"("ticket_tier_id");
CREATE UNIQUE INDEX "checkout_quotes_token_key" ON "checkout_quotes"("token");
CREATE UNIQUE INDEX "checkout_quotes_registration_id_key" ON "checkout_quotes"("registration_id");
CREATE INDEX "checkout_quotes_event_id_status_expires_at_idx" ON "checkout_quotes"("event_id", "status", "expires_at");
CREATE INDEX "checkout_quotes_user_id_status_idx" ON "checkout_quotes"("user_id", "status");
CREATE INDEX "registration_line_items_registration_id_kind_idx" ON "registration_line_items"("registration_id", "kind");
CREATE INDEX "registration_line_items_assigned_attendee_id_idx" ON "registration_line_items"("assigned_attendee_id");
CREATE UNIQUE INDEX "inclusion_inventory_reservations_idempotency_key_key" ON "inclusion_inventory_reservations"("idempotency_key");
CREATE INDEX "inclusion_inventory_reservations_registration_id_status_idx" ON "inclusion_inventory_reservations"("registration_id", "status");
CREATE INDEX "inclusion_inventory_reservations_variant_id_status_idx" ON "inclusion_inventory_reservations"("variant_id", "status");
CREATE INDEX "inclusion_inventory_reservations_status_expires_at_idx" ON "inclusion_inventory_reservations"("status", "expires_at");
CREATE INDEX "inclusion_inventory_reservations_status_rejection_grace_until_idx" ON "inclusion_inventory_reservations"("status", "rejection_grace_until");
CREATE INDEX "inclusion_inventory_movements_variant_id_created_at_idx" ON "inclusion_inventory_movements"("variant_id", "created_at");
CREATE INDEX "inclusion_inventory_movements_reservation_id_idx" ON "inclusion_inventory_movements"("reservation_id");
CREATE UNIQUE INDEX "inclusion_fulfillments_line_item_id_key" ON "inclusion_fulfillments"("line_item_id");
CREATE INDEX "inclusion_fulfillments_line_item_id_status_idx" ON "inclusion_fulfillments"("line_item_id", "status");
CREATE INDEX "inclusion_fulfillments_status_created_at_idx" ON "inclusion_fulfillments"("status", "created_at");

ALTER TABLE "event_inclusions" ADD CONSTRAINT "event_inclusions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inclusion_variants" ADD CONSTRAINT "inclusion_variants_inclusion_id_fkey" FOREIGN KEY ("inclusion_id") REFERENCES "event_inclusions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inclusion_tier_eligibility" ADD CONSTRAINT "inclusion_tier_eligibility_inclusion_id_fkey" FOREIGN KEY ("inclusion_id") REFERENCES "event_inclusions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inclusion_tier_eligibility" ADD CONSTRAINT "inclusion_tier_eligibility_ticket_tier_id_fkey" FOREIGN KEY ("ticket_tier_id") REFERENCES "ticket_tiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "checkout_quotes" ADD CONSTRAINT "checkout_quotes_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "checkout_quotes" ADD CONSTRAINT "checkout_quotes_ticket_tier_id_fkey" FOREIGN KEY ("ticket_tier_id") REFERENCES "ticket_tiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checkout_quotes" ADD CONSTRAINT "checkout_quotes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "checkout_quotes" ADD CONSTRAINT "checkout_quotes_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "registration_line_items" ADD CONSTRAINT "registration_line_items_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "registration_line_items" ADD CONSTRAINT "registration_line_items_assigned_attendee_id_fkey" FOREIGN KEY ("assigned_attendee_id") REFERENCES "attendees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inclusion_inventory_reservations" ADD CONSTRAINT "inclusion_inventory_reservations_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inclusion_inventory_reservations" ADD CONSTRAINT "inclusion_inventory_reservations_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "checkout_quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inclusion_inventory_reservations" ADD CONSTRAINT "inclusion_inventory_reservations_line_item_id_fkey" FOREIGN KEY ("line_item_id") REFERENCES "registration_line_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inclusion_inventory_reservations" ADD CONSTRAINT "inclusion_inventory_reservations_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "inclusion_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inclusion_inventory_movements" ADD CONSTRAINT "inclusion_inventory_movements_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "inclusion_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inclusion_inventory_movements" ADD CONSTRAINT "inclusion_inventory_movements_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "inclusion_inventory_reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inclusion_inventory_movements" ADD CONSTRAINT "inclusion_inventory_movements_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inclusion_fulfillments" ADD CONSTRAINT "inclusion_fulfillments_line_item_id_fkey" FOREIGN KEY ("line_item_id") REFERENCES "registration_line_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inclusion_fulfillments" ADD CONSTRAINT "inclusion_fulfillments_fulfilled_by_id_fkey" FOREIGN KEY ("fulfilled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inclusion_fulfillments" ADD CONSTRAINT "inclusion_fulfillments_reversed_by_id_fkey" FOREIGN KEY ("reversed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "event_inclusions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inclusion_variants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inclusion_tier_eligibility" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "checkout_quotes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "registration_line_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inclusion_inventory_reservations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inclusion_inventory_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inclusion_fulfillments" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_inclusions_service_role_all" ON "event_inclusions" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "inclusion_variants_service_role_all" ON "inclusion_variants" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "inclusion_tier_eligibility_service_role_all" ON "inclusion_tier_eligibility" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "checkout_quotes_service_role_all" ON "checkout_quotes" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "registration_line_items_service_role_all" ON "registration_line_items" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "inclusion_inventory_reservations_service_role_all" ON "inclusion_inventory_reservations" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "inclusion_inventory_movements_service_role_all" ON "inclusion_inventory_movements" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "inclusion_fulfillments_service_role_all" ON "inclusion_fulfillments" FOR ALL TO service_role USING (true) WITH CHECK (true);
