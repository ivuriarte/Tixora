-- Convert all monetary columns from centavos to pesos.
-- Previously all money was stored in centavos (integer-like) inside NUMERIC(10,2)
-- columns. Going forward values are stored as real peso amounts (e.g. 850.00).

-- Ticket tiers: price per ticket
UPDATE "ticket_tiers" SET "price" = ROUND("price" / 100, 2);

-- Order line items
UPDATE "order_items"
SET "unit_price" = ROUND("unit_price" / 100, 2),
    "subtotal"   = ROUND("subtotal"   / 100, 2);

-- Orders
UPDATE "orders"
SET "subtotal" = ROUND("subtotal" / 100, 2),
    "fees"     = ROUND("fees"     / 100, 2),
    "total"    = ROUND("total"    / 100, 2);

-- Registrations (unit_price nullable)
UPDATE "registrations"
SET "unit_price" = CASE WHEN "unit_price" IS NOT NULL THEN ROUND("unit_price" / 100, 2) ELSE NULL END,
    "subtotal"   = ROUND("subtotal"  / 100, 2),
    "fees"       = ROUND("fees"      / 100, 2),
    "discount"   = ROUND("discount"  / 100, 2),
    "total"      = ROUND("total"     / 100, 2);

-- Referral codes: only fixed_amount rows stored money in centavos;
-- percentage rows store the raw percentage number (e.g. 10 for 10%) and are unchanged.
UPDATE "referral_codes"
SET "discount_value" = ROUND("discount_value" / 100, 2)
WHERE "discount_type" = 'fixed_amount';

-- Referral code usages: the actual peso amount discounted per registration
UPDATE "referral_code_usages"
SET "discount_amount" = ROUND("discount_amount" / 100, 2);
