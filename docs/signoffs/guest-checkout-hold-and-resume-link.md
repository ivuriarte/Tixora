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
| Frontend | 2026-10-02 | a911a6f | APPROVE WITH CONDITIONS | Approved with conditions (Ian, 2026-10-02) | Conditions met in code: page-level headings (resume page, full-page reservation screens); tracker scrubbers extracted and unit-tested; reload after a temporary resume failure retries (secret kept in sessionStorage until a final answer). Also fixed: Speed Insights scrubbed, quiet expiry re-check, focus outline. Follow-ups: hardcoded `24 hours`/`60 minutes` copy must match config if either is changed; `process.env.NODE_ENV` in `instrumentation-client.ts` predates this branch (separate chore). |
| Backend | 2026-10-02 | a911a6f | APPROVE WITH CONDITIONS | Approved with conditions (Ian, 2026-10-02) | Fixed: cleanup re-checks the deadline under the row lock (extension race); legacy reminder loop excludes guest holds; failed email refunds the extended-hold slot; an ended hold cannot be extended; unbuildable reminder link frees its marker; Sentry scrub drops bodies, cookies, query strings and runs on transactions. Documented, not changed: Redis hold-counter window can roll over before its mapping expires (small extra headroom, low impact); add-on expiry path and `cancel()` do not clear `guestResumeEmail`/release the Redis slot but cannot be reached by a guest hold today (guest intents reject add-ons, and a claim only happens after proof, which clears the email). If guests ever gain an add-on step, route those paths through `RegistrationHoldService`. |
| Release | 2026-10-02 | a911a6f | APPROVE WITH CONDITIONS | Approved with conditions (Ian, 2026-10-02) | C1 PR description carries the rollback/verification section (see PR). C2 RLS outputs for UAT then production filed here BEFORE each migration (script: `scripts/sql/check-guest-hold-migration.sql`). C3 frontend/backend gates signed here before merge to uat. C4 `apps/web/playwright-report/index.html` is not staged. C5 lint, typecheck and API tests green (40 suites / 377 tests; web e2e 125 passed). C6 merge the axios audit fix (other session, `fix/axios-audit`) first or expect the UAT build-check audit step to fail. |
| SEO | | | | | Skip expected: no public page content, URL or metadata changes (the resume page is `noindex`) |

**Security review (`/security-review`, 2026-10-02):** no HIGH or MEDIUM findings above the confidence bar. One low-confidence observation (a 5xx on the resume route could put its body in Sentry) is now closed: the Sentry scrub drops request bodies.

**Funnel sign-off (design rule 6):** recorded by Ian on 2026-10-02 for the 60-minute guest hold.

**Decisions:** approved / approved with conditions / rejected / skipped — <reason>

## Notes

- Evidence for the design came from production queries run by Ian in the Supabase SQL Editor on 2026-10-02 (read-only): five anonymous `pending_payment` guest holds, one customer cancel, and 12 historical `Registration abandoned` auto-cancels (cleanup job confirmed working).
- Found during investigation, fixed in this feature: the payment-reminder job runs every 5 minutes with a 1-hour window and no sent-marker (duplicate reminders); guests can start unlimited holds; admins cannot release a `pending_payment` hold.
- Known follow-up (not in this feature): referral usage rows are not released when a registration is cancelled or expires (promo codes are disabled in the UI today).
- Coordination: the "Session timeout and progress loss" session works in `/Users/ianvince/Developer/Tixora-wt-event-drafts` (branch `feat/event-step-navigation`). Overlap is limited to `admin.service.ts` and `admin.controller.ts` in different functions; Ian merges PRs one at a time.

- Known UAT-only window (release gate): Vercel can deploy the UAT API before `migrate-db` finishes; until it does, registration queries fail with "column does not exist". Production is protected (`migrate-prod` runs before `deploy-api`). Recovery: wait for `migrate-db`, re-run the failed job.
- Follow-up (not in this feature): add the Slack failure hook to `.github/workflows/cron.yml`; with 60-minute holds a silently failing cleanup matters more.
- **RLS evidence, PRODUCTION (read-only checks run by Ian in the Supabase SQL Editor, 2026-10-02) — PASS:**
  - Check A (policies on `registrations`): no rows returned, so no policy exposes any row to `anon`, `public` or `authenticated`.
  - Check B: `relrowsecurity = true`, `relforcerowsecurity = false` (RLS on; the table owner and service roles bypass it, which is how the API connects).
  - Check C: `anon` has the default `SELECT` grant on `guest_email` (`true`), harmless because RLS is on with no policy.
  - Check D (`pending_payment` rows that already have a payment proof): `0`, so the shared release helper's "no proof" re-check changes nothing for early-bird cancels.
  - Database gate condition B is therefore MET for production. UAT checks A to D are still to be run and filed before the UAT migration.
