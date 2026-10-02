-- READ-ONLY investigation: pending "Walk-in attendee" registrations
-- Event: "WAIT... this song was on glee: A Cabaret"
--
-- How to use (Supabase > SQL Editor):
--   * Select the PRODUCTION project (these rows are on axontickets.online).
--   * The editor only shows the result of the LAST statement it runs, so
--     highlight ONE query at a time and press Run (Cmd+Enter runs the selection).
--   * Every query below is a SELECT. Nothing here writes, updates or deletes.
--   * It deliberately does NOT select guest_access_token_hash.
--
-- Edit the list in the "refs" CTE if you want to check other references.

-- ─────────────────────────────────────────────────────────────────────────────
-- Query 1: one row per reference — what is it, who owns it, how old is it?
--   Look at:
--     has_user / has_attendee = false, false  -> shows as "Walk-in attendee"
--     proof_count = 0                         -> abandoned before uploading proof
--     age_hours                               -> over 24 means the cleanup job should have cancelled it
-- ─────────────────────────────────────────────────────────────────────────────
WITH refs(reference_number) AS (
  VALUES
    ('AXN-2026-QF5N8'),
    ('AXN-2026-DQUYC'),
    ('AXN-2026-F8FC3'),
    ('AXN-2026-5RH0S'),
    ('AXN-2026-J3Y4D'),
    ('AXN-2026-7GS5E')
)
SELECT
  r.reference_number,
  r.status::text                                   AS status,
  r.tier_name,
  r.attendee_count,
  r.total,
  r.payment_method,
  (r.user_id IS NOT NULL)                          AS has_user,
  (r.guest_email IS NOT NULL)                      AS has_guest_email,
  (r.guest_access_token_hash IS NOT NULL)          AS is_guest_intent,
  r.attendees_completed_at,
  (SELECT count(*) FROM attendees a WHERE a.registration_id = r.id)        AS attendee_rows,
  (SELECT count(*) FROM payment_proofs p WHERE p.registration_id = r.id)   AS proof_count,
  r.created_at,
  r.updated_at,
  round(extract(epoch FROM (now() - r.created_at)) / 3600.0, 1)            AS age_hours
FROM registrations r
JOIN refs USING (reference_number)
ORDER BY r.created_at;

-- ─────────────────────────────────────────────────────────────────────────────
-- Query 2: audit trail for those references.
--   For AXN-2026-DQUYC (Andrew Topinio, cancelled), look for:
--     REGISTRATION_AUTO_CANCELLED  -> the hourly cleanup cancelled it (metadata.reason = "Registration abandoned")
--     a customer cancel action     -> performed_by_id will be set
-- ─────────────────────────────────────────────────────────────────────────────
WITH refs(reference_number) AS (
  VALUES
    ('AXN-2026-QF5N8'),
    ('AXN-2026-DQUYC'),
    ('AXN-2026-F8FC3'),
    ('AXN-2026-5RH0S'),
    ('AXN-2026-J3Y4D'),
    ('AXN-2026-7GS5E')
)
SELECT
  r.reference_number,
  l.created_at,
  l.action,
  l.performed_by_id,
  l.metadata
FROM audit_logs l
JOIN registrations r ON r.id = l.registration_id OR r.id::text = l.entity_id
JOIN refs USING (reference_number)
ORDER BY r.reference_number, l.created_at;

-- ─────────────────────────────────────────────────────────────────────────────
-- Query 3: how many seats are being held by unpaid guest intents, per tier?
--   unpaid_holds_seats = seats counted as "taken" by pending_payment registrations
--   (these are what Andrew sees eating into Balcony / VIP availability)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  t.name                                            AS tier,
  t.total_quantity,
  t.sold_quantity,
  coalesce(sum(r.attendee_count) FILTER (WHERE r.status::text = 'pending_payment'), 0)  AS unpaid_holds_seats,
  coalesce(sum(r.attendee_count) FILTER (WHERE r.status::text IN ('proof_submitted','pending_approval')), 0) AS awaiting_review_seats,
  coalesce(sum(r.attendee_count) FILTER (WHERE r.status::text = 'verified'), 0)         AS verified_seats
FROM ticket_tiers t
LEFT JOIN registrations r ON r.tier_id = t.id
WHERE t.event_id = (
  SELECT event_id FROM registrations WHERE reference_number = 'AXN-2026-QF5N8'
)
GROUP BY t.id, t.name, t.total_quantity, t.sold_quantity, t.sort_order
ORDER BY t.sort_order;

-- ─────────────────────────────────────────────────────────────────────────────
-- Query 4: is the hourly cleanup actually running?
--   If this returns cancelled-by-cleanup rows recently, it is working.
--   If it returns nothing AND you have pending_payment rows older than 24h
--   (see age_hours in Query 1), the cron job is probably not firing.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  date_trunc('day', created_at) AS day,
  count(*)                      AS auto_cancelled
FROM audit_logs
WHERE action = 'REGISTRATION_AUTO_CANCELLED'
  AND created_at > now() - interval '14 days'
GROUP BY 1
ORDER BY 1 DESC;

-- ═════════════════════════════════════════════════════════════════════════════
-- Pre-migration checks for guest-checkout-hold-and-resume-link (database gate)
-- Run each on UAT and on PRODUCTION BEFORE that environment's migration runs.
-- All read-only. File the output in docs/signoffs/guest-checkout-hold-and-resume-link.md
-- ═════════════════════════════════════════════════════════════════════════════

-- Check A: row-level security policies on registrations.
-- PASS = no rows, or no policy that applies to anon, public or authenticated and
-- returns other people's rows. A permissive policy would expose guest emails
-- (guest_email today, guest_resume_email after the migration) through Supabase's public API.
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'registrations';

-- Check B: RLS switches.
SELECT relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE oid = 'public.registrations'::regclass;

-- Check C: can the anonymous role read the existing guest email column?
-- (true is harmless ONLY if Check A passes)
SELECT has_column_privilege('anon', 'public.registrations', 'guest_email', 'SELECT') AS anon_can_read_guest_email;

-- Check D: did the early-bird auto-cancel ever see a pending_payment row that already
-- has a payment proof? The shared release helper now skips such rows, so this tells us
-- whether that is a behaviour change. Expected: 0.
SELECT count(*) AS pending_with_proof
FROM registrations r
WHERE r.status::text = 'pending_payment'
  AND EXISTS (SELECT 1 FROM payment_proofs p WHERE p.registration_id = r.id);

-- ═════════════════════════════════════════════════════════════════════════════
-- After the migration: new guest holds should carry a deadline.
-- ═════════════════════════════════════════════════════════════════════════════

-- Check E: guest holds created after deploy have hold_expires_at ~60 minutes after created_at.
SELECT reference_number, status::text AS status, created_at, hold_expires_at,
       round(extract(epoch FROM (hold_expires_at - created_at)) / 60.0) AS hold_minutes,
       (guest_resume_email IS NOT NULL) AS has_resume_email
FROM registrations
WHERE hold_expires_at IS NOT NULL
ORDER BY created_at DESC
LIMIT 20;
