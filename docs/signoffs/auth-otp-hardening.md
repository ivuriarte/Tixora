# Gate Ledger — Sign-in code hardening (atomic attempt counter, single-use code, refresh tokens not accepted as bearer)

**Started:** 2026-11-18
**Branch:** `fix/auth-hardening-2026-11`, from `origin/uat` at `78cfce1` (after PRs #90 and #91)
**One-line description:** Three small changes to the email-code sign-in, ported by hand from an old local commit (`c900ea2`, 2026-10-02) that was never merged: failed code attempts are counted atomically so a burst of parallel guesses cannot beat the 5-try limit; a code can be used once even by two simultaneous requests; a refresh token can no longer be used as a normal bearer token. Nothing a normal user sees changes.
**Artifacts:** none (no routes, DTOs, schema or env changes)

| Gate | Date | Git SHA | Agent verdict | Ian's decision | Conditions / notes |
|---|---|---|---|---|---|
| Design | 2026-11-18 | | SKIP | PENDING | No screen changes. |
| Database | 2026-11-18 | | SKIP | PENDING | No schema change, no migration, no new table (so no RLS item). The only data effect is the same two writes as before (code marked used, user marked verified), now in one interactive transaction. |
| API | 2026-11-18 | `774cd7c` (after-the-fact review) | APPROVE WITH CONDITIONS. No routes, DTOs or response shapes changed. The web app only ever sends the access token as Bearer and sends the refresh token only in the body of `/auth/refresh` and `/auth/logout`, so nothing in the repo (web, e2e, scripts, cron) breaks. | PENDING | Real routes are `POST /auth/verify-email` (service method `verifyOtp`) and `POST /auth/verify-access`, not `/auth/verify-otp` (that name is only stale doc text). A refresh token sent as Bearer gets **401 "Invalid or expired token"**: the guard replaces the strategy's own message, and the web branches on status only. A second simultaneous redemption gets **400 "This code was already used. Request a new one."** Applied: guard-level test that runs a real RS256 access token and refresh token through `JwtAuthGuard`. |
| Frontend | 2026-11-18 | | SKIP | PENDING | No web files changed. Follow-up (not blocking): a user who double-submits the same code at the same moment can now see "This code has already been used" while actually being signed in by the other request. Pages without an in-flight guard: `auth/access`, `auth/organizer`, `register/complete`, `become-organizer` (x2), `auth/verify`. Copy the `verifyingRef` pattern from `register/page.tsx`. |
| Backend | 2026-11-18 | `774cd7c` | APPROVE WITH CONDITIONS. Counter semantics verified unchanged (exactly 5 tries; the 5th wrong try invalidates the code; 6th and later are blocked before the compare). The Lua increment is atomic; the conditional `updateMany` arbitrates parallel redemption under Postgres READ COMMITTED; Redis failure fails closed; interactive transactions are already the house pattern on the same pooler; no OTP code is logged; no `NODE_ENV`; no raw SQL. | PENDING | Conditions applied in this PR: count-5 right-code success, Redis-throws fail-closed, real-token `jti` contract test, stateful concurrency tests (10 parallel wrong guesses give exactly 5 real tries; two parallel right codes give exactly one sign-in and no tokens for the loser), loser-gets-no-tokens assertions. Mutation-checked: removing the `jti` check fails 3 tests; reverting to a non-atomic counter fails 8. **Condition not applied here (out of scope): `confirmGuestCheckout`, see Follow-ups.** Before `uat` to `main`: run the Registration golden path on UAT (see below). |
| Release | 2026-11-18 | | PENDING | PENDING | No workflow, env or migration change. Rollback is a plain revert of the merge commit. |
| SEO | 2026-11-18 | | SKIP | PENDING | No public pages. |

**Decisions:** pending Ian.

## UAT checks before `uat` to `main` (Registration golden path)
1. Email code happy path signs in.
2. A wrong code shows the usual message; 5 wrong codes lock the code; a fresh code works after the wait.
3. A refresh token (copy it from the browser's local storage) sent as `Authorization: Bearer` to `GET /auth/me` returns 401.
4. Normal session refresh from the web app still works (leave a tab open past the 15-minute access token).

## Follow-ups (not in this PR)
- **`confirmGuestCheckout` in `registrations.service.ts` (~lines 1046-1110) has the same flaw this PR fixes in auth**: it reads the attempt counter, compares, and only then increments; and the code is deleted only at the end, so two parallel right-code requests can both pass. Fix: increment before compare, and use the `del` return value as the single-use claim. Medium severity (needs a valid guest link; the route is throttled to 10/min/IP).
- `refreshTokens` checks the stored session with `get` then `del` as two steps, so two parallel refreshes with one token can both succeed; and it does not check that `jti` is present. Low.
- Web in-flight guards on the OTP pages listed above. Cosmetic.
- `sendOtp` does not reset the per-user attempt counter, so after 5 wrong tries a new code stays blocked until the counter window ends (guest flow resets it). Product decision.
- `acceptPendingOrganizationInvitation` is a multi-step write with no transaction and runs right after the code is consumed. Pre-existing.

## Notes
- **Held back from the original commit, pending Ian's decision** (they change behaviour, so they are not in this PR):
  1. Password sign-in for platform admins only (`POST /auth/login` rejecting non-admins with the same "Invalid email or password" message). Needs the count of non-admin accounts that still have a password (read-only SQL for Ian, in the session notes folder).
  2. `POST /auth/register` retired (HTTP 410). Nothing in the web app calls it. This item was in the old commit's message but not in the brief.
  3. Clearing the password hash on non-admin accounts when they verify by code. This one is a data write on user rows, also not in the brief.
- Why not a cherry-pick: `auth.service.ts` changed since the old commit (cooldown work in #89/#90), so the intent was re-applied by hand. A remote branch `origin/security/auth-hardening` already holds an older copy of the same commit (22fe18f, four files, based on `2251bfa`); it was never opened as a PR and is left untouched.
- Verification: API suite 470 passed (49 suites); lint and `tsc --noEmit` clean on both apps.
