-- READ-ONLY checks for the guest-checkout-hold-and-resume-link migration (database gate).
-- Supabase > SQL Editor. Highlight ONE query at a time and run it (Cmd+Enter runs the selection).
-- Nothing here writes, updates or deletes.
--
-- Run A to D on UAT, then on PRODUCTION, BEFORE the migration runs on that environment.
-- Run E after the deploy. File the output in docs/signoffs/guest-checkout-hold-and-resume-link.md.
-- (The one-off investigation of the five unfinished checkouts is in
--  check-pending-guest-registrations.sql.)

-- ═════════════════════════════════════════════════════════════════════════════
-- BEFORE the migration (run on UAT, then on PRODUCTION)
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
