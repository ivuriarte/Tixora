ALTER TABLE "attendees"
  ADD COLUMN "sub_event_id" TEXT,
  ADD COLUMN "sub_event_title" TEXT,
  ADD COLUMN "sub_event_time" TEXT;

CREATE INDEX "attendees_sub_event_id_idx" ON "attendees"("sub_event_id");
