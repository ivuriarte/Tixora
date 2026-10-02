# Design Spec — Uniform 60-minute holds and "sold vs held" counts

**Feature:** uniform-holds-and-sold-vs-held · **Date:** 2026-10-02 · **Author:** Claude, decisions by Ian
**Status:** Design phase, revision 2 (incorporates design-gate and API-gate round 1 conditions). Nothing in this spec is implemented yet.
**Wireframes:** [`uniform-holds-and-sold-vs-held-wireframes.html`](./uniform-holds-and-sold-vs-held-wireframes.html)
**Follows:** `guest-checkout-hold-and-resume-link.md` (live in production since 2026-10-02, PR #73).

---

## 1. Problem

After the guest-hold release, the admin Events list and dashboard still showed **"7 sold"** for an event with **0 paid registrations** (Ian's screenshot, 2026-10-02): seven seats were unpaid checkouts. Goal (Ian): *the organizer must not be misled about transactions coming in and out; a customer who misses the hold can simply start again.*

### Verified facts (code on `main` at `d112a6a` and production data)

| Fact | Evidence |
|---|---|
| The admin "N sold" is the live **reserved** count: unpaid holds + awaiting review + approved + valid tickets. | `admin.service.ts:580` (`ticketsSold` sums `withLiveInventory().soldQuantity`); `events.service.ts getTierUsage` uses `ACTIVE_REGISTRATION_STATUSES`. |
| Event analytics, executive analytics and the organizer dashboard sales figures are **already confirmed-only**. | `admin.service.ts:1681-1732`, `executive-analytics.service.ts`. |
| The event closeout PDF prints `soldQuantity / totalQuantity` from the **stored** tier column, which also includes unpaid holds. | `workspaces.service.ts:2183`. |
| Logged-in users' unpaid holds still use the legacy 24-hour rule (no `holdExpiresAt`). Guest holds are 60 minutes. | `registrations.service.ts create()` passes no deadline; `createGuestIntent` does. `createImpl` already accepts a trailing `holdExpiresAt?: Date`. |
| Public availability ("N slots left"), on-site walk-in capacity and discovery labels must keep counting holds, or events could be oversold. | `events.service.ts` (`withLiveInventory`, on-site check). |
| The on-site registration page is **public**. | `events.service.ts handleOnsiteRegistrationScan`. |
| **There is no capacity-cut guard today.** `TicketTiersService.update` only validates `@Min(1)`; an organizer can lower a tier below what is already reserved. | `ticket-tiers.service.ts`, admin routes `PUT/DELETE /admin/tiers/:tierId` (`admin.controller.ts:200-209`). |
| `listEvents` is already N+1 (two `groupBy` per event, limit 100). | `admin.service.ts` listEvents via `withLiveInventory`. |
| Free events are created as `pending_approval`, so they never have a payment deadline. | `registrations.service.ts createImpl`. |

## 2. Goals and non-goals

**Goals**
1. One consistent definition everywhere an admin or organizer reads seat counts, in the **admin's own words**: **Sold**, **Awaiting review**, **Pending payment**; **Reserved** is their sum.
2. Every admin/organizer screen and document that says "sold" means confirmed sales only.
3. Every new unpaid hold, for guests **and** logged-in users, lasts the same short time (default 60 minutes). (Decision: Ian, 2026-10-02.)
4. An organizer can no longer cut a tier's capacity below the seats already reserved. (Decision: Ian, 2026-10-02.)

**Non-goals**
- Changing public availability, on-site capacity maths, discovery labels or any analytics figure (already correct).
- Showing breakdown counts on any **public** page, including the on-site registration page.
- Add-on registrations (own 120-minute stock hold), free events, and rows that already exist (they keep the legacy 24-hour rule and expire on their own).
- Changing the guest "pay later with email" 24-hour hold.
- Changing the Pixel/funnel events or moving any funnel step.

## 3. Vocabulary (admin side)

| Admin label | Database state | Meaning shown to the organizer |
|---|---|---|
| **Sold** | `verified` registrations + `valid`/`used` tickets | Paid and approved. |
| **Awaiting review** | `proof_submitted`, `pending_approval` | Proof sent (or free registration) and waiting for an admin. Matches the Verifications queue. |
| **Pending payment** | `pending_payment` | Seat held, no proof yet. Auto-released after the hold. |
| **Reserved** | sum of the three | What public availability uses. |

Never "awaiting approval", never "unpaid holds" in the UI (the word "hold" appears only in help text). These labels reuse one shared `SeatCounts` component and the existing status-chip classes from `admin/verifications/page.tsx` (extracted into a shared `StatusChip`, not copied).

## 4. Design decisions

### D1. One shared, admin-only breakdown

A new method `EventsService.getTierBreakdown(tierIds)` returns, per tier, `{ confirmed, awaitingReview, held }`.

- It is **separate** from `withLiveInventory` / `getTierUsage`. Those keep their exact shapes and are the only thing public endpoints call, so a new field cannot leak publicly by construction.
- It runs **once per request for the whole page**: one `registration.groupBy({ by: ['tierId','status'] })` and one `ticket.groupBy` across all tier ids on the page (replaces the per-event N+1 for the admin list).
- `reserved = confirmed + awaitingReview + held` and must equal today's `soldQuantity` for the same data (test asserts the invariant).
- Tickets are counted once; cancelled, rejected and expired rows count nowhere.

### D2. Uniform hold length

New unpaid registrations for logged-in users get `holdExpiresAt = now + MEMBER_HOLD_MINUTES` (default **60**).

- The deadline is set **inside `createImpl`, only when** the event is paid **and** the registration has no add-on/quote selection. Free events (created `pending_approval`) and add-on registrations get none.
- A dedicated `memberDeadline()` helper (not `GuestHoldService.initialDeadline`, which belongs to guests and a different setting).
- Existing rows are untouched and keep the legacy 24-hour rule. The cleanup rules already cover both.
- **Gap closed:** between the deadline and the next 5-minute cleanup, a logged-in hold can be "expired but still `pending_payment`". The logged-in pages detect a passed `holdExpiresAt`, show the expired screen, and release through the existing cancel route (which treats an expired hold as releasable). The duplicate-registration guard also treats an expired hold as releasable. Test covers both.
- **Funnel sign-off (Ian, 2026-10-02):** logged-in hold 24 h → 60 min; no step moved; Pixel and funnel events unchanged; a logged-in customer who needs longer (for example a slow bank transfer) starts again, with no "email me a link" route (that remains guest-only). Success check after release: watch the logged-in checkout-to-proof completion rate for one week.
- Setting `MEMBER_HOLD_MINUTES` (10–1440, default 60).

### D3. Admin dashboard and Events list

Replace "N sold" with a `SeatCounts` group: **`5 Sold · 2 Awaiting review · 7 Pending payment`**.

- Visible, non-hover legend under the list (not a tooltip): each term in one line. Counts are text first; colour only reinforces.
- Zero parts are shown as a neutral gray "0" in the detail views and omitted in the compact row; if all are zero show "0 Sold". Singular/plural handled ("1 Awaiting review").
- `role="group"` with `aria-label="Seat counts"`.
- A **"View pending checkouts"** link (44 px tall target) goes to Transactions filtered to pending for that event.
- Event dates use the weekday format the admin already uses.
- The existing "sold out" badge keeps meaning "reserved ≥ capacity" and says so in help text, so a "Sold out" badge beside "3 Sold" is explained.
- **States:** loading skeleton, empty ("No events yet"), error with a Retry button, and **"Counts unavailable"** (never "0") if the breakdown request fails while the list loads.

### D4. Event editor tier cards and the new capacity guard

Tier cards show Sold, Awaiting review and Pending payment separately.

- **New guard (Ian approved):** `PUT /admin/tiers/:tierId` rejects a capacity lower than the **live reserved** count with **409** and the message *"You can't go below 12: 5 sold, 2 awaiting review, 5 pending payment. Wait for pending checkouts to expire, or release them in Transactions."* The count is computed **inside the same transaction** as the update (row lock on the tier) so a concurrent registration cannot slip under it.
- This **tightens an existing input** (previously accepted); it is a deliberate behavior change recorded in the ledger.
- `DELETE /admin/tiers/:tierId` stays blocked while any reserved seats exist, and its error now uses the live breakdown.
- Error panel next steps are plain and actionable; one link to the filtered Transactions page.

### D5. Closeout PDF

The tier table's "Sold" column shows **confirmed** sales; two new columns show **Awaiting review** and **Pending payment**; the header says what each means. Computed from per-tier `groupBy` queries inside `WorkspacesService` (no new dependency on `EventsService`). Revenue column unchanged.

### D6. Labels in Transactions

Unchanged: status label for `pending_payment` stays "pending"; subtitle "All checkouts and payments".

### D7. Logged-in registration and payment pages

Reuse `HoldBanner` and the expired/cancelled `ReservationEndState` for logged-in users. The guest-only "save for later / email me a link" card is **hidden** on logged-in pages. `registrations/[id]/page.tsx` does not use `HoldBanner` today; wireframes now redraw this screen from the real variants.

## 5. Configuration

| Variable | Default | Range | Purpose |
|---|---|---|---|
| `MEMBER_HOLD_MINUTES` | `60` | 10–1440 | Hold for a logged-in user's unpaid registration (paid events without add-ons). |

Added to Joi validation (`env.validation.ts`), `configuration.ts`, `apps/api/.env.example` and `docs/environment-matrix.md`. The `GUEST_HOLD_MINUTES` row in the matrix is corrected: "Logged-in registrations keep the 24-hour rule" is no longer true. Uses `APP_ENV`, never `NODE_ENV`. No new secret.

## 6. Database

**No schema change.** `holdExpiresAt` exists and the cleanup honours it. Database gate: skipped with reason (confirmed by Ian, 2026-10-02). The cron docstring is updated: the "12–13 hours" reminder loop becomes dead code for new logged-in holds (60-minute holds expire first); it still serves legacy rows and guest extended holds.

## 7. API contract (additive, except the D4 guard)

| Endpoint | Auth | Change |
|---|---|---|
| `GET /admin/events` (dashboard and Events list) | existing admin/organizer guard | Each item adds `ticketsConfirmed`, `ticketsAwaitingReview`, `ticketsHeld`. `ticketsSold` unchanged (reserved). Each tier adds `confirmedQuantity`, `awaitingReviewQuantity`, `heldQuantity`. Uses one breakdown query set per request. |
| `GET /admin/events/:id` (editor) | existing event-access check | Tiers add the same three fields. |
| `GET /registrations/:id` (logged-in owner) | JWT, owner only | Adds `holdExpiresAt` (ISO string or null) by explicit field mapping (no object spread). |
| `PUT /admin/tiers/:tierId` | existing admin/organizer guard + ownership | **New:** 409 when capacity < live reserved, evaluated in-transaction. |
| `DELETE /admin/tiers/:tierId` | existing | Error text uses the live breakdown (409 unchanged). |
| Public `GET /events`, `/events/:slug`, discovery, on-site | public | **No new fields.** A test walks the real public list, detail, discovery and on-site outputs and asserts none of the six new field names appears anywhere in the JSON. |

Nothing monetary is read from the client. No endpoint is added.

## 8. Screens and states

See the wireframes (desktop and 320 px phone frames; default, loading, empty, error, "Counts unavailable"): dashboard event row, Events list row with the real action grid, tier card, capacity guard error, closeout PDF table, logged-in registration/payment page banner and expired screen (from the real `HoldBanner` / `ReservationEndState` variants).

## 9. Test plan

- **API unit:** `getTierBreakdown` (each status lands in exactly one bucket; reserved equals the old number for mixed data; cancelled/rejected/expired count nowhere; tickets once; single groupBy pair for many tiers); admin list/detail include the new fields while `ticketsSold` is unchanged; **public leak test** (six field names absent from public list/detail/discovery/on-site); logged-in `create` sets a deadline for paid, no deadline for free or add-on; `findById` returns `holdExpiresAt`; expired-but-not-yet-cleaned logged-in hold is releasable by cancel and by the duplicate guard; cleanup cancels an expired logged-in hold; capacity guard (409 below reserved, OK at reserved, concurrent registration race); delete error text; closeout PDF rows (confirmed vs reserved); Joi range for `MEMBER_HOLD_MINUTES`.
- **Web (Playwright, mocked API):** dashboard and Events rows for mixed, zero-pending, all-zero, loading, empty, error and "Counts unavailable"; 320 px layout with no horizontal scroll; link to filtered Transactions; tier card parts; capacity guard error; logged-in payment page banner and expired screen; guest-only card hidden for logged-in; existing suites unchanged.
- **Golden paths after the change:** registration (guest and logged-in), admin verification, event creation.

## 10. Rollout

Feature branch → PR into `uat` → UAT deploy green → promotion PR to `main` (Ian merges). No migration, so no ordering concern. Rollback = revert code. Existing holds are unaffected. Behavior changes to call out in the PR: logged-in hold 60 min; capacity guard now rejects previously accepted cuts.
