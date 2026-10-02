# Gate Ledger — Uniform 60-minute holds and sold-vs-held counts

**Started:** 2026-10-02
**Branch:** `feat/uniform-holds-and-sold-vs-held` (from `origin/main` d112a6a)
**One-line description:** Make every new unpaid hold (guests and logged-in users) last 60 minutes, and show confirmed sales, awaiting-review and unpaid holds separately in admin and organizer views so "sold" never includes unpaid checkouts.

**Artifacts:** `docs/specs/uniform-holds-and-sold-vs-held.md`, `docs/specs/uniform-holds-and-sold-vs-held-wireframes.html`

| Gate | Date | Git SHA | Agent verdict | Ian's decision | Conditions / notes |
|---|---|---|---|---|---|
| Design | 2026-10-02 | 2b39f77 | Round 1: APPROVE WITH CONDITIONS (12). Round 2: APPROVE WITH CONDITIONS (all 12 resolved; N1–N4 fixed in wireframes/spec abdb489) | Approved with conditions by Ian 2026-10-02 | Spec/wireframes rev 2 address all findings. Funnel sign-off recorded by Ian 2026-10-02: logged-in hold 24 h to 60 min, no step moved, Pixel/funnel events unchanged, no pay-later route for logged-in (start again), check logged-in checkout-to-proof rate for one week after release. |
| Database | 2026-10-02 | | SKIP | Confirmed by Ian 2026-10-02 | No schema change: `holdExpiresAt` already exists and the cleanup already honours it. |
| API | 2026-10-02 | 2b39f77 | Round 1: APPROVE WITH CONDITIONS (10 findings, 8 conditions). Round 2: APPROVE WITH CONDITIONS (8 resolved; N1–N9 folded into spec rev 3: same FOR UPDATE lock order, guard only when capacity changes, member deadline only for logged-in with no supplied deadline, delete 400→409 behavior change, shared reserved helper, 5-minute expired-hold window documented) | Approved with conditions by Ian 2026-10-02 | Rev 2: separate admin-only `getTierBreakdown` (no change to `withLiveInventory`), one grouped query set per request, public-leak test, in-transaction capacity guard (Ian approved the behavior change 2026-10-02), routes fixed to `/admin/tiers/:tierId`, deadline set in `createImpl` for paid non-add-on only, expired-but-not-cleaned handling, `MEMBER_HOLD_MINUTES` in Joi/config/.env.example/environment-matrix. |
| Frontend | 2026-10-02 | 6d07017 | APPROVE WITH CONDITIONS | Pending Ian | OPEN, not yet fixed: (1) registrations/[id] page needs the same retry-after-deadline loop as the payment page (MEDIUM, required before uat); (3) tier-card Counts unavailable needs Retry; (4) legend line explaining the Sold out badge; optional: aria-label on div, 409-only link in tier alert, ignore unknown eventId in deep link. |
| Backend | 2026-10-02 | 6d07017 | APPROVE WITH CONDITIONS | Pending Ian | try/catch on both lazy releases and `as any` justification: DONE. True concurrent registration-vs-capacity test: NOT DONE (needs DB-backed test), waiver needs Ian. Accepted deviation: expired-hold release runs before the advisory lock (safe: row lock + re-check). |
| Release | | | | | Not started |
| SEO | | | | | Skip expected: admin-only screens, no public page content, URL or metadata changes |

**Decisions:** approved / approved with conditions / rejected / skipped — <reason>

## Notes

- Origin: Ian's production screenshot (2026-10-02) of the admin Events list showing "7 sold" for an event with 0 paid registrations (seven seats were unpaid holds).
- Ian's decision (2026-10-02): all new unpaid holds should be short for everyone; a customer who misses the window simply starts again.
- Findings from the module audit: analytics, executive analytics and organizer sales figures are already confirmed-only; the dashboard/Events list "sold", the closeout PDF "sold / total" and the tier cards use the reserved count. Public availability, on-site walk-in capacity and discovery labels must keep counting holds (anti-oversell) and are unchanged. The on-site registration page is public, so held-seat counts are never shown there.
