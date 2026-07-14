-- Add daily attendance records for multi-day registration events.
-- Existing attendees.checked_in_at remains as the legacy first-check-in marker.

CREATE TABLE "attendee_attendance" (
  "id" TEXT NOT NULL,
  "attendee_id" TEXT NOT NULL,
  "registration_id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "check_in_date" DATE NOT NULL,
  "checked_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "checked_in_by_id" TEXT,
  "check_in_method" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "attendee_attendance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attendee_attendance_attendee_id_event_id_check_in_date_key"
  ON "attendee_attendance"("attendee_id", "event_id", "check_in_date");

CREATE INDEX "attendee_attendance_event_id_check_in_date_idx"
  ON "attendee_attendance"("event_id", "check_in_date");

CREATE INDEX "attendee_attendance_registration_id_idx"
  ON "attendee_attendance"("registration_id");

CREATE INDEX "attendee_attendance_checked_in_by_id_idx"
  ON "attendee_attendance"("checked_in_by_id");

ALTER TABLE "attendee_attendance"
  ADD CONSTRAINT "attendee_attendance_attendee_id_fkey"
  FOREIGN KEY ("attendee_id") REFERENCES "attendees"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendee_attendance"
  ADD CONSTRAINT "attendee_attendance_registration_id_fkey"
  FOREIGN KEY ("registration_id") REFERENCES "registrations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendee_attendance"
  ADD CONSTRAINT "attendee_attendance_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendee_attendance"
  ADD CONSTRAINT "attendee_attendance_checked_in_by_id_fkey"
  FOREIGN KEY ("checked_in_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
