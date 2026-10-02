# Design Spec — Uniform 60-minute holds and "sold vs held" counts

**Feature:** uniform-holds-and-sold-vs-held · **Date:** 2026-10-02 · **Author:** Claude, decisions by Ian
**Status:** Design phase, revision 1. Nothing in this spec is implemented yet.
**Wireframes:** [`uniform-holds-and-sold-vs-held-wireframes.html`](./uniform-holds-and-sold-vs-held-wireframes.html)
**Follows:** `guest-checkout-hold-and-resume-link.md` (live in production since 2026-10-02, PR #73).

---

## 1. Problem

After the guest-hold release, the admin Events list and dashboard still showed **"7 sold"** for an event with **0 paid registrations** (Ian's screenshot, 2026-10-02): seven seats were unpaid checkouts. Goal (Ian): *the organizer must not be misled about transactions coming in and out; a customer who misses the hold can simply start again.*

### Verified facts (code on `main` at `d112a6a` and production data)

| Fact | Evidence |
|---|---|
| The admin "N sold" is the live **reserved** count: unpaid holds + awaiting review + approved + valid tickets. | `admin.service.ts:580` (`ticketsSold` sums `withLiveInventory().soldQuantity`); `events.service.ts getTierUsage` uses `ACTIVE_REGISTRATION_STATUSES`. |
| Event analytics, executive analytics and the organizer dashboard sales figures are **already confirmed-only** (verified registrations, valid tickets, paid orders). | `admin.service.ts:1681-1732`, `executive-analytics.service.ts`. |
| The event closeout PDF prints `soldQuantity / totalQuantity` from the **stored** tier column, which also includes unpaid holds. | `workspaces.service.ts:2183`. |
| Logged-in users' unpaid holds still use the legacy 24-hour rule (no `holdExpiresAt`). Guest holds are 60 minutes. | `registrations.service.ts create()` passes no deadline; `createGuestIntent` does. |
| Public availability ("N slots left"), on-site walk-in capacity and discovery labels must keep counting holds, or events could be oversold. | `events.service.ts` (`withLiveInventory`, on-site check). |
| The on-site registration page is **public** (attendees open it from the QR code). | `events.service.ts handleOnsiteRegistrationScan`. |

## 2. Goals and non-goals

**Goals**
1. One consistent definition everywhere an admin or organizer reads seat counts: **Sold** (confirmed), **Awaiting review**, **Unpaid holds**; **Reserved** is their sum.
2. Every admin/organizer screen and document that says "sold" means confirmed sales only.
3. Every new unpaid hold, for guests **and** logged-in users, lasts the same short time (default 60 minutes), so unpaid holds disappear quickly. (Decision: Ian, 2026-10-02.)

**Non-goals**
- Changing public availability, on-site capacity maths, discovery labels or any analytics figure (already correct).
- Showing held-seat counts on any **public** page (including the on-site registration page): internal numbers must not leak.
- Add-on registrations (own 120-minute stock hold), free events (no payment step), and rows that already exist (they keep the legacy 24-hour rule and expire on their own).
- Changing the guest "pay later with email" 24-hour hold.

## 3. Design decisions

### D1. One shared breakdown

Replace "one number" with a breakdown computed in one place (`EventsService`), next to the existing usage count:

| Bucket | Counts |
|---|---|
| **sold** (confirmed) | `verified` registrations + `valid`/`used` tickets |
| **awaitingReview** | `proof_submitted` + `pending_approval` registrations |
| **held** (unpaid) | `pending_payment` registrations |
| **reserved** | sold + awaitingReview + held (exactly today's number) |

Existing fields and their meaning do not change (`soldQuantity`, `availableQuantity`, `ticketsSold` stay "reserved" for backward compatibility); the breakdown is **added** as new fields. Public responses never include the new fields.

### D2. Uniform hold length

New unpaid registrations for logged-in users get `holdExpiresAt = now + MEMBER_HOLD_MINUTES` (default **60**), the same mechanism guests use. The cleanup job already cancels any `pending_payment` row whose deadline passed, so no scheduler change is needed beyond a test. Add-on registrations and free events get no deadline (unchanged). Existing rows are untouched.

- The logged-in registration page and payment page show the same hold banner and expired/cancelled screens guests already have.
- If a logged-in user already has an unpaid hold, the existing "you already have an incomplete registration" message stays; it now clears within the hour (or they can cancel).
- Setting: `MEMBER_HOLD_MINUTES` (10–1440, default 60), documented in `.env.example` and `docs/environment-matrix.md`.

### D3. Admin dashboard and Events list

Replace "N sold" with: **`5 sold · 2 awaiting approval · 7 unpaid holds`** (parts with zero are omitted; if all are zero show "0 sold"). "Unpaid holds" links to Transactions filtered to pending for that event. Hover/long-press text explains each part. Never colour alone; the labels carry the meaning.

### D4. Event editor tier cards and capacity rules

Tier cards show sold, awaiting review and held separately. The two protections stay: capacity cannot be cut below **reserved**, and a tier with reserved seats cannot be deleted. Their error messages name the parts: *"You can't go below 12: 5 sold, 2 awaiting approval, 5 unpaid holds. Release unpaid holds or wait for them to expire."*

### D5. Closeout PDF

The tier table's "Sold" column shows **confirmed** sales; two new columns show **Awaiting review** and **Unpaid holds**; the header says what each means. Revenue column unchanged (already confirmed-only).

### D6. Labels in Transactions

The Transactions status label for `pending_payment` stays "pending". The subtitle already reads "All checkouts and payments". No change.

## 4. Configuration

| Variable | Default | Range | Purpose |
|---|---|---|---|
| `MEMBER_HOLD_MINUTES` | `60` | 10–1440 | Hold for a logged-in user's unpaid registration (paid events without add-ons). |

No new secret. Uses `APP_ENV`, never `NODE_ENV`.

## 5. Database

**No schema change.** `holdExpiresAt` already exists and the cleanup already honours it.

## 6. API contract (additive only)

| Endpoint | Auth | Change |
|---|---|---|
| `GET /admin/events` (dashboard and Events list) | existing admin/organizer guard | Each item adds `ticketsConfirmed`, `ticketsAwaitingReview`, `ticketsHeld`. `ticketsSold` unchanged (reserved). Each tier adds `confirmedQuantity`, `awaitingReviewQuantity`, `heldQuantity`. |
| `GET /admin/events/:id` (editor) | existing event-access check | Tiers add the same three fields. |
| `GET /registrations/:id` (logged-in owner) | JWT, owner only | Adds `holdExpiresAt` (ISO string or null). |
| `PATCH /ticket-tiers/:id`, `DELETE /ticket-tiers/:id` | existing | Error text names the parts (409/400 unchanged). |
| Public `GET /events`, `/events/:slug`, discovery | public | **No new fields.** Test asserts the public tier objects contain none of the three. |

Nothing monetary is read from the client. No endpoint is added. All counts come from existing grouped queries (one extra `groupBy` per request, bounded by tier count).

## 7. Screens and states

See the wireframes (desktop and phone, default/loading/empty/error/success where applicable): admin dashboard event row, Events list row, tier card with the three parts, capacity-cut error, closeout PDF table, logged-in registration/payment page hold banner and expired screen.

## 8. Test plan

- **API unit:** the breakdown function (each status lands in exactly one bucket; reserved equals the old number for mixed data; cancelled/rejected/expired count nowhere; tickets counted once); admin list and detail include the new fields while `ticketsSold` is unchanged; **public responses never contain the new fields**; logged-in `create` sets a deadline (and not for free events or add-ons); `findById` returns `holdExpiresAt`; cleanup cancels an expired logged-in hold; the capacity/delete error messages; PDF tier rows (confirmed vs reserved).
- **Web (Playwright, mocked API):** dashboard and Events row wording for mixed, zero-held and all-zero cases; link to filtered Transactions; tier card parts; logged-in payment page shows the banner and the expired screen; existing suites unchanged.
- **Golden paths after the change:** registration (guest and logged-in), admin verification, event creation.

## 9. Rollout

Feature branch → PR into `uat` → UAT deploy green → promotion PR to `main` (Ian merges). No migration, so no ordering concern. Rollback = revert code. Existing holds are unaffected.
