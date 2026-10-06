# Gate Ledger — Verification Queue: no hidden date filter by default

**Started:** 2026-10-06
**Branch:** `fix/queue-default-dates` (from `origin/uat`)
**One-line description:** The admin Verification Queue no longer defaults its date filter to today, which hid every order created on an earlier day that was still awaiting review; labels on the filters are now connected to their inputs.
**Artifacts:** `docs/specs/verification-queue-default-dates.md`

| Gate | Date | Git SHA | Agent verdict | Ian's decision | Conditions / notes |
|---|---|---|---|---|---|
| Design | 2026-10-06 | | SKIP (proposed) | Pending Ian | No new screen or copy beyond one empty-state sentence; the filters keep their layout. |
| Database | 2026-10-06 | | SKIP | Pending Ian | No schema change. |
| API | 2026-10-06 | | SKIP | Pending Ian | No endpoint, DTO or query change; the web simply stops sending `dateFrom`/`dateTo` by default (the API already treats them as optional). |
| Frontend | 2026-10-06 | commit after 41add3a | APPROVE (no blockers). Verified: the API treats the dates as optional and clamps the page size (50 per page, max 100), nothing else in the web app assumes a date default, the count badge was never date-filtered, label ids are unique. Nice-to-haves applied: exact `#queue-event` locator in the tests, a test for another status and for Date To alone. | Pending Ian | Web-only change; rollback is a plain revert. |
| Backend | 2026-10-06 | | SKIP | Pending Ian | No API code changed. |
| Release | 2026-10-06 | | PROPOSED: APPROVE. No `.github/workflows`, env, migration or dependency change; web only; rollback = revert the PR (no SQL). Needs CI green on the PR and the UAT automated checks before `uat` to `main`. | Pending Ian | Manual UAT only if Ian wants it: open the queue with an event that has an order from an earlier day and confirm it is listed. |
| SEO | 2026-10-06 | | SKIP | Pending Ian | Admin page, not indexable. |

## Notes
- Origin: found while investigating a stuck checkout (2026-10-06): the hotfix notes already said to "clear the date filters" to see the order.
- Sizing: a read-only production query (kept local, not committed) counts awaiting-review registrations created before today, per event. Result to be filed here by Ian.
- Verified on branch: web tsc, next lint, next build, Playwright admin-mocked 58 passed (3 new queue tests).
