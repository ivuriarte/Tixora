-- Preserve the organizer-provided fulfillment instructions as they were quoted
-- so later catalog edits cannot change customer or staff purchase records.
ALTER TABLE "registration_line_items"
ADD COLUMN "fulfillment_instructions_snapshot" TEXT;
