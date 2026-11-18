# Gate Ledger — Guest checkout confirmation code: atomic try counter and single-use claim

**Started:** 2026-11-18
**Branch:** `fix/guest-checkout-otp-race`, from `origin/uat` at `696184e` (after PRs #89, #90, #91, #93)
**One-line description:** The email-code step of guest checkout (`POST /registrations/guest/:id/confirm`) had the same two races the sign-in code had (fixed in `fix/auth-hardening-2026-11`): failed tries were counted after the compare, and the code was deleted only after the attendee save. Tries are now counted atomically before the compare, and deleting the code is the single-use claim, made before anything is written. Nothing a normal buyer sees changes.
**Artifacts:** none (no routes, DTOs, schema or env changes). One new Redis helper, `RedisService.deleteIfEquals`, an additive Lua compare-and-delete in the same style as `incrementWithTtl`.

| Gate | Date | Git SHA | Agent verdict | Ian's decision | Conditions / notes |
|---|---|---|---|---|---|
| Design | 2026-11-18 | | SKIP | PENDING | No screen changes. |
| Database | 2026-11-18 | | SKIP | PENDING | No schema change, no migration, no new table (so no RLS item). Redis keys keep their names and the stored code record keeps its shape, so a code issued before the deploy still works after it. |
| API | 2026-11-18 | `bdaa55b` (after-the-fact review; same code as `98ceac9`) | APPROVE. No conditions. | PENDING | No route, DTO or response-shape change; the guest-token check is still the first line; nothing client-supplied is newly trusted. Every existing response (status and message) is unchanged, including the 409 duplicate-conflict body and the request-code cooldown contract from #89/#90 (`OTP_COOLDOWN`, `OTP_SEND_LIMIT`, `retryAfterSeconds`, `codeActive`), which the diff does not touch. The ONE new response is **400 "This code was already used. Request a new one."** for the loser of two simultaneous right-code requests (same status and text as the sign-in fix; 409 was rejected because it already means "duplicate email" on this route). The only web caller (`RegistrationForm.tsx`, `verifyPaidCheckout`) shows `response.data.message`, clears the code field and has an in-flight guard; the e2e spec mocks the route. Optional follow-up, not blocking: the new message is a little off if the code actually expired or was replaced during the request. |
| Frontend | 2026-11-18 | | SKIP | PENDING | No web files changed. |
| Backend | 2026-11-18 | `bdaa55b`, then re-review of `b639de4` (= `98ceac9`, `1748bf7` after rebase) | First review APPROVE WITH CONDITIONS; **re-review APPROVE, no blocking conditions.** | PENDING | Review confirmed: Lua `INCR` gives every request its own number, so at most 5 compares happen; the right code gives its try back so attendee-form mistakes do not lock a buyer out; Redis failure at every call fails closed (nothing written, no audit entry); no OTP, hash or address is logged; no `NODE_ENV`, no raw SQL. **Conditions from the first review, all applied:** (1) the claim is now a compare-and-delete on the exact record verified (`deleteIfEquals`), because a plain `DEL` let a request holding a replaced code delete the buyer's newer code; (2) a test runs the REAL attendee-save status check behind the "give the code back" path (a completed order is refused even though the code was put back); (3) a test where giving the code back fails (buyer still sees the original error, one warn line with the registration id only, no code or hash). Also applied: warn log on a failed give-back, comment made precise. |
| Release | 2026-11-18 | | PENDING | PENDING | No workflow, env or migration change. Rollback is a plain revert of the merge commit (nothing persistent changed shape). |
| SEO | 2026-11-18 | | SKIP | PENDING | No public pages. |

**Decisions:** pending Ian. (This session recorded the agent verdicts only; it did not record any approval on Ian's behalf.)

## UAT checks before `uat` to `main` (guest Registration golden path)
1. **A successful guest confirmation** (request code, enter the right code, land on the complete page). Required: this is the one check that runs the new Lua claim against a real Redis (unit tests mock it), and a wrong compare there would block every guest.
2. A wrong code shows "Incorrect code. Please try again."; five wrong codes show "Too many failed attempts. Request a new code."; a fresh code works after the usual wait (the cooldown messages and `retryAfterSeconds` are unchanged).
3. Enter the right code but leave a mistake in the attendee form (for example a birthday in the future): the form error shows, and the **same code still works** after fixing it.
4. Reusing a code that was already used shows the usual "Code expired or invalid. Request a new one."

## Follow-ups (not in this PR)
- **Pre-existing, same shape, not fixed here:** the unconditional `del(otpKey)` when the stored record cannot be parsed, and when the 5th wrong try burns the code. A burst of wrong guesses could delete a newer code issued a moment earlier; the buyer just asks for another. Low.
- Pre-existing: `updateAttendeesForRegistration` reads the order status outside its transaction with no row lock, so single use rests on the Redis claim plus that status check.
- Pre-existing: if Redis fails in the clean-up right after a successful save, the buyer gets a 500 although the registration was saved.
- Pre-existing: `:id` on this route has no UUID pipe; its 400 responses are not documented in Swagger.
- A buyer can retry the same right code any number of times (the try is given back); bounded by the route throttle (10/min/IP) and the code's 5-minute life.
- No unit test can execute Lua; the new helper's script text is pinned and UAT check 1 above exercises it for real. The two older Lua helpers have the same gap.
- The ledger `docs/signoffs/auth-otp-hardening.md` (other PR) lists this flaw as a follow-up; once both PRs are merged that bullet can be removed.

## Notes
- Two behaviours were deliberately kept the same as before, because the web page depends on them: a right code is not a failed try (the try is handed back with `decrementIfPositive`), and when the attendee save fails the code is put back with its remaining life, only if no newer code is stored (`setIfNotExists`), so the buyer can fix the form and submit again with the same code (the page clears the code field after any error, not the code).
- Verification: API suite 474 passed (50 suites: 447 on `uat` + 24 in the new `registrations.service.guest-confirm-race.spec.ts` + 3 in the new `redis.service.spec.ts`); `npm run lint` and `tsc --noEmit` clean on `apps/api` and `apps/web`; `scripts/hooks/pre-push.sh` (simulated new-branch push) passed, its "CI/deploy config changed" warning comes from the merge-base with `main` containing #91, not from this diff.
- Tests use a stateful fake Redis (atomic operations, real interleaving), not canned return values: 10 parallel wrong guesses give exactly 5 real compares (4 "Incorrect", 6 "Too many"); 2 and 5 parallel right-code requests give exactly one save and one audit entry; the 5th try with the right code succeeds; Redis failing at `get`, `incrementWithTtl`, `decrementIfPositive`, `ttl` or `deleteIfEquals` fails closed. **Mutation-checked with 19 mutants, all killed** (counter after compare, claim after the writes, claim result ignored, off-by-one limit, no refund, no/wrong/overwriting restore, fail-open at each Redis call, early gate removed, 5th wrong try not burning the code, plain `del` claim, restore error swallowed or log leaking the record, status check loosened).
- `/security-review` was not run for this PR (the brief did not ask for it); the auth PR's was clean at confidence 8+.
