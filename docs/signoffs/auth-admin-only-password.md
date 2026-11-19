# Gate Ledger — Password sign-in for platform admins only; password sign-up retired

**Started:** 2026-11-18
**Branch:** `fix/auth-admin-only-password-2026-11`, from `origin/uat` at `696184e`
**One-line description:** `POST /auth/login` now accepts platform admins only (everyone else gets the same "Invalid email or password" as an unknown account and uses the emailed code); `POST /auth/register` answers 410 Gone. Ported by hand from an old local commit (`c900ea2`); the companion changes (atomic code attempts, single-use code, refresh tokens not accepted as bearer) are a separate PR (`fix/auth-hardening-2026-11`).
**Artifacts:** none

| Gate | Date | Git SHA | Agent verdict | Ian's decision | Conditions / notes |
|---|---|---|---|---|---|
| Design | 2026-11-18 | | SKIP | PENDING | No screen changes. |
| Database | 2026-11-18 | | SKIP | PENDING | No schema change, no migration, no data write. |
| API | 2026-11-18 | `7f2bb0e` (after-the-fact) | APPROVE WITH CONDITIONS. Auth guards, throttles, DTOs and envelopes unchanged; 410 is the right status for a retired route; no consumer in web, e2e, scheduler, scripts or workflows depends on `POST /auth/register` or on a non-admin password login. | PENDING | Recorded as a deliberate rule-14 break (first-party consumers only, effectively zero live non-admin password users). Applied: the two docs that gave a `curl` to `/auth/register` now use `/auth/request-access`; the seed script no longer prints a password that cannot sign in; load-test README says login needs an admin account. **To do at UAT:** confirm the `UAT_TEST_ADMIN_EMAIL` user has `isAdmin = true` (else the admin e2e job will 401); then `POST /auth/register` with an empty body returns 410; `POST /auth/login` as a seeded non-admin test user returns 401 "Invalid email or password"; the UAT admin login still returns 200. |
| Frontend | 2026-11-18 | | SKIP | PENDING | No web files changed. The only password field is `/auth/admin`; `/auth/login` redirects to the emailed-code page. |
| Backend | 2026-11-18 | `7f2bb0e` | APPROVE WITH CONDITIONS. No raw SQL, no `NODE_ENV`, no new writes or logging. Checked every other path that could give a non-admin a password session (`changePassword` is already admin-only; no other module sets a password hash; only `seed.ts` writes hashes): none. An unverified non-admin can no longer trigger a code email through login. | PENDING | Conditions are the low-severity follow-ups below (dead `AuthService.register`; timing hint). The unit tests call the controller directly, so a UAT `curl` (see API row) closes the HTTP-layer gap. |
| Release | 2026-11-18 | | PENDING | PENDING | No workflow, env or migration change. Rollback is a plain revert of the merge commit. |
| SEO | 2026-11-18 | | SKIP | PENDING | No public pages. |

**Decisions:** pending Ian.

## Why this is safe to ship (read-only counts, 2026-11-18)
- Production: 434 users, 2 admins (both with a password), exactly **1** non-admin account with a password (verified, not an organizer, no activity since September). The public sign-in page only offers the emailed code, so no one loses a route they could reach from the UI.
- UAT: 12 users, 2 admins, **2** non-admin password accounts, both seeded test users created by `prisma/seed.ts`; nothing in the repo signs in as them.
- Not included on purpose: clearing password hashes on non-admin accounts when they verify by code (a data write; unnecessary now that password login is admin-only).

## Follow-ups (not in this PR)
- Timing: non-admin, unknown and password-less accounts are rejected before the bcrypt compare, while an admin with a wrong password pays for it, so response time can hint at which emails are admins. Fix: a dummy compare against a constant hash on the early-reject path. Low (throttled 10/min/IP; unknown-versus-password-account timing already differed).
- `AuthService.register()` (and `RegisterDto`, plus the shared type) is now unreachable dead code that still contains the password sign-up path. Delete together.
- Web: the "This account does not have admin access" branch on `/auth/admin` is now unreachable; the orphaned `/auth/verify` page (its only `userId` source was the old register reply) and its routes could be retired.
- Seed: stop setting a password hash for the two UAT test users.
