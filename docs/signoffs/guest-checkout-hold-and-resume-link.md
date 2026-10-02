# Gate Ledger — Guest checkout hold, resume link and hold controls

**Started:** 2026-10-02
**Branch:** `fix/guest-hold-and-resume-link` (from `origin/main` 9422441)
**One-line description:** Shorten unpaid guest seat holds to 60 minutes, let guests save an email to get a resume link and a 24-hour hold, cap and de-duplicate guest holds, let guests and admins release holds, and stop calling unfinished checkouts "Walk-in attendee".

**Artifacts:** `docs/specs/guest-checkout-hold-and-resume-link.md`, `docs/specs/guest-checkout-hold-and-resume-link-wireframes.html`

| Gate | Date | Git SHA | Agent verdict | Ian's decision | Conditions / notes |
|---|---|---|---|---|---|
| Design | 2026-10-02 | 9422441 (docs uncommitted) | PASS WITH CONDITIONS (round 1: 15 findings; round 2: all met except missing phone/429 frames, cancel-error copy, expired-vs-elsewhere rule, banner format, which were then added in spec/wireframes rev 2.1) | Approved with conditions (Ian, 2026-10-02) | Funnel sign-off RECORDED by Ian on 2026-10-02: 60-minute guest hold (GUEST_HOLD_MINUTES, configurable). API guard for the 60-minute hold (rule 6). API guard rejecting add-ons on guest intents must ship with its test. |
| Database | 2026-10-02 | 9422441 (docs uncommitted) | APPROVE WITH CONDITIONS (round 1 and round 2) | Approved with conditions (Ian, 2026-10-02) | A: retention clear inside the createdAt branch + test with a zero-attendee, zero-proof hold. B: file pg_policies, relrowsecurity, relforcerowsecurity and column-privilege output for UAT and production BEFORE the migration runs on each (production so far: relrowsecurity=true, anon has default SELECT grant; policies not yet listed; UAT not yet checked). C: migration.sql matches the three planned statements, no drops; drop script + precheck written in the PR description. D: early-bird path gets cap and budget; confirm zero-proofs recheck changes nothing. |
| API | 2026-10-02 | 9422441 (docs uncommitted) | APPROVE WITH CONDITIONS (round 1 and round 2) | Approved with conditions (Ian, 2026-10-02) | C-A extended-hold cap (2 per IP per event per day); C-B decrement mapping + guarded Lua; C-C truthful uniform 200 and Redis-outage behaviour; C-D pino redact in bracket notation (incl. existing x-cron-secret) + test; C-E HMAC-keyed limiter keys + token id regex; C-F 409 code passes the exception filter, web branch, e2e mock; C-G other analytics scripts do not capture the fragment. |
| Frontend | | | | | Not started |
| Backend | | | | | Not started |
| Release | | | | | Not started |
| SEO | | | | | Skip expected: no public page content, URL or metadata changes (the resume page is `noindex`) |

**Decisions:** approved / approved with conditions / rejected / skipped — <reason>

## Notes

- Evidence for the design came from production queries run by Ian in the Supabase SQL Editor on 2026-10-02 (read-only): five anonymous `pending_payment` guest holds, one customer cancel, and 12 historical `Registration abandoned` auto-cancels (cleanup job confirmed working).
- Found during investigation, fixed in this feature: the payment-reminder job runs every 5 minutes with a 1-hour window and no sent-marker (duplicate reminders); guests can start unlimited holds; admins cannot release a `pending_payment` hold.
- Known follow-up (not in this feature): referral usage rows are not released when a registration is cancelled or expires (promo codes are disabled in the UI today).
- Coordination: the "Session timeout and progress loss" session works in `/Users/ianvince/Developer/Tixora-wt-event-drafts` (branch `feat/event-step-navigation`). Overlap is limited to `admin.service.ts` and `admin.controller.ts` in different functions; Ian merges PRs one at a time.
