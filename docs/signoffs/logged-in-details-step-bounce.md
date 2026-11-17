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

**Decisions:** pending Ian.

## Notes
- Root cause, tests, deploy order and rollback: see the spec.
- B5b, B6, B7 are drafts in the spec, not built.
- Incident SQL is kept local (`scripts/sql/` is never committed: the repo is public).
