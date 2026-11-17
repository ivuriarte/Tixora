# Spec — Logged-in buyers bounced away from the attendee-details step

**Feature:** logged-in-details-bounce · **Date:** 2026-11-17 · **Author:** Claude, decisions by Ian
**Status:** Part 1 (A2, A3, B1, B2, B3, B4) implemented on branch `fix/logged-in-details-bounce`. Part 2 (B5b, B6, B7) are **drafts for Ian's review, not built**. B5a is a routine, documented below.
**Follows:** `checkout-dead-end-and-incomplete-orders.md` (Release 1, live 2026-10-06).

---

## 1. Incident (no customer details; the repo is public)

An organizer could not approve a paid order ("order A"). The payment was safe and the buyer had finished everything the screen asked for, but the Approve button stayed disabled.

### Root cause (high confidence; read from code and production data, never reproduced in a browser)

1. For a **logged-in** buyer, `GET /registrations/:id` returned an explicit list of fields that **left out `tierId`**. (The guest read, `findGuestById`, returns the whole row, so guests were fine.) The shared type already declared `tierId: string | null`, so nothing flagged the gap.
2. The payment page builds the link to the attendee-details step from that response, so the link carried an **empty** `tierId=`.
3. The register page read the empty value as a real tier id, found no such tier, and **silently redirected to the event page** before the attendee-details form. Details were never saved, `attendees_completed_at` stayed empty, and the server correctly refuses to approve such an order.
4. The earlier Release 1 tests always put `tierId=tier-1` in the address, so they could not see this.

Proof the buyer was bounced: the event page records `event_page_viewed` right after `payment_submitted`, and that tracker only mounts on the public event page.

## 2. Changes (one branch, separate commits)

| Id | Change | Where |
|---|---|---|
| A2 | `findById` returns `tierId` | `registrations.service.ts` (commit `3ea25a2`, **independently revertable**) |
| B1/B2 | Contract tests on the response shape (incl. a compile-time check against the shared `Registration` type) | `registrations.service.find-by-id-contract.spec.ts` |
| A3 | Register page: an empty/missing/hidden tier on an **existing** order no longer redirects. It uses the order's own tier. If the tier or event truly cannot be loaded, the buyer sees "We couldn't open the last step" (do not pay again; Try again; Contact organizer when known; Back to event). New checkouts behave as before. Payment page stops writing an empty `tierId=`. | `register/page.tsx`, `register/payment/[registrationId]/page.tsx` |
| B4 | New funnel step `details_step_unavailable` (status `blocked`; metadata fixed to `where: 'register'` and `reason: 'tier_missing' \| 'event_load_failed'`) | `funnel.constants.ts` (API allowlist), `funnel.ts`, admin analytics label |
| B3 | UAT-15 scenario, golden-path note, pre-production checklist line | `docs/UAT-ACCEPTANCE-SCENARIOS.md`, `CLAUDE.md`, `docs/release-process.md` |
| A1 | One-off rescue script for the stuck order: guarded, atomic, with an undo. Ian runs it by hand in the Supabase SQL editor. **Kept local and not committed** (the repo is public; incident SQL names real order references). | local `scripts/sql/` only |

### Deploy order
**API first, web second.** On merge to `main` both deploy from Git in parallel, so this is not enforced by the pipeline. Release it as two pull requests: first the API commit(s) only (branch `fix/logged-in-details-bounce-api`), then, once the API deploy is green, the rest. Why:
- The API alone is safe and already fixes the bug (the existing payment page reads `reg.tierId`).
- If the new web page goes live **before** the API, logged-in buyers see "We couldn't open the last step" instead of the form until the API lands (the "Try again" button works then).
- The API rejects an unknown funnel step with HTTP 400 (validated against the allowlist), so a web page that is live before the API loses its `details_step_unavailable` events. Buyers never see this error.
Do not announce or test until both deploys are green.

### Rollback
Code revert only; **no schema change**. Roll the **web** back first if needed (Vercel: promote the previous deployment); the extra `tierId` field in the API is harmless and can stay. **Never roll back only the API**: with the new web live and no `tierId` from the API, every logged-in buyer would see the message instead of the form. Do not drop anything in the database.

### Tests
- API: 3 new contract tests (one checks every scalar field of the shared `Registration` type at compile time); full API suite passed.
- Web e2e (`checkout-dead-end.spec.ts`): 27 passed, 9 of them new. Run against the **old** page code, 6 of the new ones fail, including the exact incident link (empty `tierId=`).
- Web `tsc`, `eslint`, `next build` clean.

### Verification after deploy
- Funnel: a logged-in `payment_submitted` should be followed by `details_confirm_started`, not `event_page_viewed`.
- Run `scripts/sql/check-stuck-unfinished-orders.sql` (B5a) and confirm the list is empty or explained.
- Any `details_step_unavailable` events: investigate each one. They are stored in the funnel table but **do not show in Admin > Analytics yet** (that screen lists only `failed` events and a fixed set of steps). Check by SQL: `SELECT created_at, metadata FROM registration_funnel_events WHERE step = 'details_step_unavailable' ORDER BY created_at DESC;` (`event_load_failed` rows carry no event id). Showing `blocked` steps in Admin > Analytics is a small follow-up.

---

## 3. B5a — Regular stuck-order check (routine, in place now)

**What:** `check-stuck-unfinished-orders.sql` (kept in the local `scripts/sql/` folder, not committed) is a single read-only SELECT. It lists paid-for orders (proof uploaded) that the organizer cannot see because the details step was never saved.

**Routine:**
- **Weekly, Monday morning** (Ian), and **the same day as every production release** that touches checkout.
- Run in the Supabase SQL editor on production. Selects no email, phone or token.
- For each row: `hours_since_proof` under 2 → buyer may still be typing, recheck later. Over 24 → act.
- `has_user = true` → rescue with a guarded one-off script like the one used for this incident (create it locally, do not commit it). `has_user = false` (guest) → the buyer must finish it with their private link; contact the organizer, who can reach the buyer.
- Ignore rows Ian has confirmed were abandoned. Note them in the ledger so they are not re-investigated.

---

## 4. Drafts for review (NOT built)

These were approved in principle ("all"), but they are new features with product decisions inside them. Drafted here so Ian can decide the details before any code is written.

### B5b — Automatic stuck-order alert
- **Idea:** a new cron endpoint, `POST /cron/check-stuck-orders`, called from `.github/workflows/cron.yml` (hourly). It counts orders matching the B5a rule with `hours_since_proof >= 2` and, only if the count is above zero **and changed since the last alert**, sends one email to an operations address.
- **Email content:** counts and reference numbers only. No buyer names, emails or phone numbers.
- **Needs from Ian:** who receives it (`STUCK_ORDER_ALERT_EMAIL`), how often, and whether Slack (the cron workflow already has a failure notifier) is preferred over email.
- **New config:** `STUCK_ORDER_ALERT_EMAIL` in `.env.example` and `docs/environment-matrix.md`; a new job in `cron.yml` (workflow files need the release gate and may need Ian to apply the edit by hand).
- **Safety:** read-only query, a Redis marker to avoid repeating the same alert, capped list, `CRON_SECRET` check like the other cron endpoints.
- **Size:** about one day including tests.

### B6 — Show organizers "paid, waiting for buyer details"
- **Problem:** the queue hides these orders on purpose, so an organizer whose buyer is stuck sees nothing and cannot help.
- **Idea:** in the event's registrations area, a small section "Paid, waiting for buyer details" listing reference number, tier, hours waiting, and a way to contact the buyer. The Approve button stays disabled for these.
- **Decisions needed:** which organizer roles see it; whether buyer contact details are shown (privacy: the organizer already sees them for approved orders, but not before the buyer finishes); wording (the audience is non-technical; no "attendee_count" language).
- **Gates:** design (new screen), API (new endpoint with event-ownership auth), frontend, backend.
- **Size:** about two to three days.

### B7 — Auto-complete the details step for logged-in single-ticket buyers
- **Idea:** for a logged-in buyer with exactly one ticket, skip the form: at proof upload the server creates the lead attendee from the buyer's profile (what the rescue script does by hand), sets `attendees_completed_at`, and moves the order to `pending_approval`.
- **Risks:** the buyer's profile may not be who the ticket is for (a buyer paying for a friend); profile fields (phone, birthday, gender, city) may be incomplete or outdated and are demographic data the buyer should confirm; partner-consent wording lives on the details step and must still be shown. This changes a golden path.
- **Recommendation:** do **not** build until Release 1 and this fix have been live for a few weeks and the `details_step_unavailable` / confirm-failure numbers show the form is still a real drop-off. If built, keep a one-line "Is this ticket for you?" confirmation instead of silently skipping.
- **Gates:** design, API, backend; UAT of the full golden path.

---

## 5. Not changed
- Guest flow and claim-and-complete.
- The admin Approve rules (server still refuses orders without saved details).
- The Verification Queue filter.
- Any database table, column, index or RLS policy.
