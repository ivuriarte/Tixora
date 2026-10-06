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
| Frontend | | | | | Not started |
| Backend | 2026-10-06 | | SKIP | Pending Ian | No API code changed. |
| Release | | | | | Not started |
| SEO | 2026-10-06 | | SKIP | Pending Ian | Admin page, not indexable. |

## Notes
- Origin: found while investigating a stuck checkout (2026-10-06): the hotfix notes already said to "clear the date filters" to see the order.
- Sizing: a read-only production query (kept local, not committed) counts awaiting-review registrations created before today, per event. Result to be filed here by Ian.
