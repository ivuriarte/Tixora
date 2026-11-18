# Gate Ledger — Logged-in buyers bounced away from the attendee-details step

**Started:** 2026-11-17
**Branches:** `fix/logged-in-details-bounce-api` (API commit only) and `fix/logged-in-details-bounce` (API + web + docs), from `origin/main`
**One-line description:** A logged-in buyer who paid was silently sent back to the event page before the attendee-details step, so the organizer could not approve the order. The API now returns the order's tier, the register page no longer bounces paid buyers and says so plainly if the step cannot open, and the case is recorded in funnel tracking.
**Artifacts:** `docs/specs/logged-in-details-step-bounce.md`

| Gate | Date | Git SHA | Agent verdict | Ian's decision | Conditions / notes |
|---|---|---|---|---|---|
| Design | 2026-11-17 | after `64bb21a` | APPROVE WITH CONDITIONS. Applied: 16 px left-aligned text, same look as the "couldn't open this registration" screen, buttons that wrap around a long organizer name, "until it is done, your tickets can't be confirmed", what to keep as a receipt, no-organizer wording, "Opens their page" hint, focus moves to the message. 320 px checked for three variants (organizer, very long name, none): no sideways scroll, 44 px buttons. | PENDING | Remaining: a funnel-review sign-off for the new screen; reviewer would also like a wireframe on file (rulebook gap: no rule for small error screens). |
| Database | 2026-11-17 | | SKIP | PENDING | No schema change. |
| API | 2026-11-17 | `64bb21a` | APPROVE WITH CONDITIONS. `tierId` is owner-scoped, additive, and matches the shared type. Applied: new step added to the API funnel test list; comments corrected (metadata shape is not enforced on the public endpoint); contract test now checks every scalar field of the shared type. | PENDING | Follow-up (not in this release): Admin > Analytics does not list `blocked` steps, so the new events are checked by SQL for now. The funnel endpoint accepts any metadata shape (pre-existing). |
| Frontend | 2026-11-17 | after `64bb21a` | APPROVE WITH CONDITIONS. No client-trusted price: the order's own tier wins over the address. Applied: green e2e on a fresh build (30 passed), focus handling, message shown only when the order was actually read, no flash while the ownership check starts, failure state reset, tier id encoded. | PENDING | Follow-up: the summary price on the details step uses the event's current price rather than the order's (pre-existing client price display; track separately). |
| Backend | 2026-11-17 | | Covered by the API gate (one field added to an existing owner-scoped read). | PENDING | Full API suite 430 passed. |
| Release | 2026-11-17 | | APPROVE WITH CONDITIONS. Applied: deploy order and rollback wording corrected (two PRs, API first; roll back the web, never only the API), UAT range updated to UAT-15, real order details removed from tracked files, rescue script kept local and hardened. | PENDING | Before `uat` to `main`: UAT-15 passed with SHA, tester and date. Rescue script: rehearse on UAT inside BEGIN/ROLLBACK first; Ian runs it. |
| SEO | 2026-11-17 | | SKIP | PENDING | Private checkout pages only. |

**Decisions:** the gate rows above are as recorded on 2026-11-17. Ian gave the go for the production release on 2026-11-18, with the manual UAT run waived: see "Release 2026-11-18" at the end of this file.

## Notes
- Root cause, tests, deploy order and rollback: see the spec.
- B5b, B6, B7 are drafts in the spec, not built.
- Incident SQL is kept local (`scripts/sql/` is never committed: the repo is public).
- 2026-11-17 (Ian): proceeded with UAT's post-deploy browser regression red. 4 homepage featured-hero tests fail because UAT currently has no featured event (the public featured list is empty); the last passing Deploy UAT run was 2026-10-06. Not related to this fix or to the dependency update (the other 107 browser tests, including checkout and admin, passed). Exception accepted by Ian; to be cleared by marking an upcoming On sale UAT event as Featured. Re-confirm before `uat` goes to `main`.
- Dependency fix shipped separately first (PR #85 into `uat`): next, @sentry/nextjs, handlebars, multer, joi, body-parser, follow-redirects; it cleared both CI audit gates.

## Release 2026-11-18: `uat` to `main` (PR #88)

**Scope:** the web half of this fix (#87), the confirmation-code cooldown fix for guest, account and sign-in checkout (#89 and its review follow-ups #90, **API and web**), and a UAT-only CI change (#91). It is not web-only: about 200 lines of API source (`registrations.service.ts`, `auth.service.ts`) reach production with it. No migration, schema change, new environment variable or dependency. Deploy order does not matter (see the spec, "Release 2026-11-18").
**Build:** `uat` = `78cfce1`. A docs-only commit (this entry and the spec wording) follows it.

| Item | Result |
|---|---|
| Release gate (devops reviewer, 2026-11-18) | APPROVE WITH CONDITIONS, no code defect found. Conditions: re-diff `main...uat` after #90 (done: 25 files, matches the reviewed scope plus #91); write the waiver and exceptions here (this entry); run the UAT regression on the final head (done, below); correct the rollback wording (done in the spec; PR text corrected before merge). |
| Deploy UAT on `78cfce1` (run #128) | Migrate UAT database, Build check (including the dependency audit with the exception below), UAT smoke tests and admin regression: **passed**. Browser regression: 115 passed, 4 failed (the accepted exception below, nothing else). Run #127 on `4f61240` gave the same result. |
| Customer OTP regression | **Skipped**: it only runs when the repository variable `RUN_UAT_CUSTOMER_E2E` is `true`, and it is not set. So no automated check has confirmed that a code email actually arrives. Treat delivery as unconfirmed until a code is received. |
| Manual UAT | **Not run.** UAT-15 (already signed in before checkout) and the manual checks for #89 and #90 were waived by Ian, as owner, in chat on 2026-11-18 ("no need to wait for that"). No manual tester is recorded because none tested. |
| Ian's decision | Go for production on 2026-11-18, manual UAT waived. |

**Exceptions accepted (both by Ian, 2026-11-18):**
1. Four UAT browser tests fail because UAT has no Featured event (three hero and carousel specs in `release-2-discovery.spec.ts` and one in `public-flows.spec.ts`). Unrelated to checkout. Clear by marking an upcoming On sale UAT event as Featured.
2. Dependency audit: picomatch `GHSA-fc5q-39xc-vjpf` (high, ReDoS, no patched version exists) is allowed in the two UAT workflows only, through `.github/audit-exceptions.json` and `scripts/ci/npm-audit-gate.mjs` (PR #91). It expires on **2026-12-18** and the build fails again after that until someone re-checks for a patch. Any other high or critical advisory still fails the build. The production pipeline (`ci.yml`) never had an audit step and is unchanged.

**After deploy, verify on production (read-only):** both Vercel deployments (`api` and `tixora-online-ticket-app`) Ready on the merge commit; `ci.yml` and the e2e smoke green; no 5xx on the confirmation-code and sign-in code endpoints; a signed-in buyer's `payment_submitted` is followed by `details_confirm_started`, not `event_page_viewed`; `details_step_unavailable` stays at 0; no OTP codes in logs.
**Production outcome:** to be filled in after the deploy.
