# Gate Ledger — Uniform 60-minute holds and sold-vs-held counts

**Started:** 2026-10-02
**Branch:** `feat/uniform-holds-and-sold-vs-held` (from `origin/main` d112a6a)
**One-line description:** Make every new unpaid hold (guests and logged-in users) last 60 minutes, and show confirmed sales, awaiting-review and unpaid holds separately in admin and organizer views so "sold" never includes unpaid checkouts.

**Artifacts:** `docs/specs/uniform-holds-and-sold-vs-held.md`, `docs/specs/uniform-holds-and-sold-vs-held-wireframes.html`

| Gate | Date | Git SHA | Agent verdict | Ian's decision | Conditions / notes |
|---|---|---|---|---|---|
| Design | | | | | Review running |
| Database | 2026-10-02 | | SKIP (proposed) | Pending | No schema change: `holdExpiresAt` already exists and the cleanup already honours it. Ian to confirm the skip. |
| API | | | | | Review running |
| Frontend | | | | | Not started |
| Backend | | | | | Not started |
| Release | | | | | Not started |
| SEO | | | | | Skip expected: admin-only screens, no public page content, URL or metadata changes |

**Decisions:** approved / approved with conditions / rejected / skipped — <reason>

## Notes

- Origin: Ian's production screenshot (2026-10-02) of the admin Events list showing "7 sold" for an event with 0 paid registrations (seven seats were unpaid holds).
- Ian's decision (2026-10-02): all new unpaid holds should be short for everyone; a customer who misses the window simply starts again.
- Findings from the module audit: analytics, executive analytics and organizer sales figures are already confirmed-only; the dashboard/Events list "sold", the closeout PDF "sold / total" and the tier cards use the reserved count. Public availability, on-site walk-in capacity and discovery labels must keep counting holds (anti-oversell) and are unchanged. The on-site registration page is public, so held-seat counts are never shown there.
