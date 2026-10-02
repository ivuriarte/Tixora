## What this fixes

The admin dashboard and Events list said "7 sold" for an event with 0 paid registrations: seven seats were unpaid checkouts. Organizers must not be misled about transactions coming in and out, and a customer who misses the hold can simply start again.

## What changes

- **Logged-in unpaid holds last 60 minutes** (`MEMBER_HOLD_MINUTES`, default 60, 10-1440), same as guests. Paid events without add-ons only. Free events, add-on checkouts and the guest pay-later hold are unchanged. Existing rows keep the 24-hour rule.
- **Admin counts are split**: Sold, Awaiting review, Pending payment (dashboard, Event History, event editor tier cards, closeout PDF). `ticketsSold` keeps its meaning (reserved). Public availability and on-site capacity are unchanged and never expose the split.
- **Tier capacity guard**: a capacity below the live reserved seats is refused (409) under the same tier row lock registrations use.
- Logged-in payment and registration pages show the same hold banner and "reservation expired" screen as guests. Expired holds are released on read and before a new registration.
- Transactions page accepts `?eventId=&status=` (link "View pending checkouts").

## Behavior changes to note
- Logged-in hold 24 h to 60 min (Ian signed off; check logged-in checkout-to-proof rate for one week).
- Capacity cuts below reserved seats, previously accepted, are now rejected.
- Tier delete refusal 400 to 409 with a live count.
- `GET /registrations/:id` can release an expired hold (never fails the read).

## Database
None. No migration, no RLS change.

## Gates (ledger: `docs/signoffs/uniform-holds-and-sold-vs-held.md`)
Design and API approved with conditions (two rounds). Frontend, Backend, Release: approve with conditions, findings fixed except the DB-backed concurrency test (waiver/follow-up). `/security-review`: no findings.

## Tests
API 45 suites / 408 tests; web typecheck and lint clean; Playwright CI set 134 passed.

## Rollback
Code revert only: Vercel, Deployments, previous deployment, Promote to Production (web and API). No SQL, no schema change. Holds created in the window remain valid under old code.

## Follow-ups
- DB-backed concurrent registration-vs-capacity test.
- Fallback text if all post-deadline re-checks still report pending.
