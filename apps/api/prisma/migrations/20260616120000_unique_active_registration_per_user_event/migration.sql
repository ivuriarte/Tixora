-- Backstop against duplicate registrations: even if application-level checks
-- are bypassed or race, the database itself will refuse a second active
-- (pending_payment / proof_submitted) registration for the same user+event.
-- Cancelled/rejected/verified registrations are excluded so users can still
-- re-register after a cancellation, and a verified registration is no longer
-- "active" for this purpose.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_active_registration_per_user_event"
ON "registrations" ("user_id", "event_id")
WHERE "status" IN ('pending_payment', 'proof_submitted');
