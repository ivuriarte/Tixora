# Design Spec — Guest Checkout Hold, Resume Link and Hold Controls

**Feature:** guest-checkout-hold-and-resume-link · **Date:** 2026-10-02 · **Author:** Claude, decisions by Ian
**Status:** Design phase, **revision 2.1** (after round 1 and round 2 of the design, database and API gate reviews). Nothing in this spec is implemented yet.
**Wireframes:** [`guest-checkout-hold-and-resume-link-wireframes.html`](./guest-checkout-hold-and-resume-link-wireframes.html)
**Design system:** live tokens: primary `#7C3AED`, deep purple `#4C1D95`, Inter 400–700, existing `CountdownTimer`, `ScreenState` (`ScreenSkeleton`, `ErrorState`, `EmptyState`), `ConfirmModal` (existing props only), `axon-pill` buttons.

---

## 1. Problem

Organizer feedback (Andrew, Loft Bed Theater, 2026-10-02) plus a tester's report:

1. Five anonymous "Walk-in attendee" registrations in `pending_payment` hold 6 seats (3 Balcony registrations / 4 seats, 2 VIP registrations / 2 seats) and distort availability. The organizer wants seats guaranteed only for people who are actually paying.
2. A guest who clicks **I will pay later** cannot get back to the proof-upload page.

### Verified facts (code and production data, 2026-10-02)

| Fact | Evidence |
|---|---|
| Guest checkout creates the registration at the payment step with no user, no attendees and no email. | `createGuestIntent` ([registrations.service.ts:89](../../apps/api/src/registrations/registrations.service.ts)); production rows QF5N8, F8FC3, 5RH0S, J3Y4D, 7GS5E (Query 1: no user, 0 attendees, 0 proofs). |
| Unpaid holds count as seats everywhere: purchase check, public "N slots left", admin tier counts, on-site walk-in capacity. | `ACTIVE_REGISTRATION_STATUSES`, `getTierUsage` ([events.service.ts:27](../../apps/api/src/events/events.service.ts)), on-site check (`events.service.ts:763`). |
| The 24-hour cleanup works in production. | Query 7: 12 `REGISTRATION_AUTO_CANCELLED` with reason `Registration abandoned`; Query 5: no stale `pending_payment` rows. |
| The guest access token lives in `sessionStorage`; the server stores only its SHA-256 hash; no email exists before proof. | `register/page.tsx:923`, `assertGuestAccess`. |
| The payment reminder skips guests and links to a login-gated page. | `remindPendingRegistrations`. |
| Guests cannot cancel; admins cannot release a `pending_payment` hold. | `cancel()` needs `userId`; `reject()` status check. |
| **Existing bug:** reminder job runs every 5 minutes with a 1-hour window and no sent-marker (up to ~12 duplicates). | `.github/workflows/cron.yml`, `remindPendingRegistrations`. |
| **Existing security issue:** the API request logger redacts only `authorization`, `cookie` and `x-cron-secret`, so the `x-registration-token` header (a live guest bearer token) is written to logs on every guest request. | `app.module.ts:46-50` (verified). |
| **Existing exposure:** `findByIdAdmin` returns the raw registration row (`...reg`), including `guestAccessTokenHash`, to every organizer who opens a registration. | `registrations.service.ts:1695` (verified). |
| **Existing limitation:** `ThrottlerModule` has no shared storage, so `@Throttle` limits are per serverless instance (soft). | `app.module.ts:59-66` (verified). |
| **Security constraint:** `guest_email IS NOT NULL` on a paid guest registration currently means "email OTP not required to finalize attendees". An unverified "pay later" email must never be stored in `guest_email`. | `updateGuestAttendees` (`registrations.service.ts:575`). |
| Guests can start unlimited holds (duplicate and per-user caps are skipped when both `userId` and `guestEmail` are absent). | `createImpl` lines 202–260. |
| Platform fee defaults to a flat ₱50 per registration (explains totals such as ₱550 = ₱500 + ₱50). | `createImpl`: `event.platformFee ?? 50`. |

## 2. Goals and non-goals

**Goals**

1. An unpaid guest hold lasts **60 minutes** by default, not 24 hours. (Corrective.)
2. A guest who leaves an email on "I will pay later" gets a link back, a **24-hour** hold and a reminder. (Corrective.)
3. One network cannot hoard seats: at most **5 unpaid guest holds per IP per event per hour** and at most **2 extended (24-hour) holds per IP per event per day** (both configurable); the same browser reuses its hold instead of creating duplicates. (Preventive.)
4. Guests can cancel their own hold; admins/organizers can release a stuck hold with an audit trail. (Preventive.)
5. Admin screens stop calling unfinished checkouts "Walk-in attendee". (Corrective.)
6. The payment reminder sends once per registration. (Corrective.)
7. Guest tokens stop appearing in logs, and admin responses stop including the token hash. (Corrective, found in review.)
8. The new email feature cannot be used to spam strangers. (Preventive.)

**Non-goals**

- Changing the 24-hour hold for **logged-in** users (decision: Ian).
- Changing how admission seats are counted, or proof-upload, approval or QR flows.
- Add-on (optional inclusion) holds (own 120-minute policy). Guest checkout intents never carry add-ons (enforced, D1).
- Releasing referral usage rows on cancellation (pre-existing; promo codes are disabled in the UI). Follow-up ticket.
- Moving the whole app's throttler to Redis (follow-up; the new endpoints get their own Redis limiters).

## 3. Design decisions

### D1. Hold deadline lives on the registration

New nullable column `holdExpiresAt`, set only by the server from configuration (never from a request).

| Registration | `holdExpiresAt` | Expires |
|---|---|---|
| Guest intent created after this release | `now + GUEST_HOLD_MINUTES` (default 60) | at `holdExpiresAt` |
| Guest who saved an email | `max(existing, now + GUEST_HOLD_EXTENDED_HOURS)` (default 24) | at `holdExpiresAt` |
| Everything else (logged-in, existing rows, other guest flows) | `NULL` | `createdAt + 24 h` (unchanged legacy rule) |

- Existing rows keep `NULL`: deploying changes nothing for them. No backfill.
- `createGuestIntent` rejects `quoteToken` and `inclusionSelections` (new explicit guard), so a hold deadline never coexists with an add-on hold. The web never sends them to this endpoint today.
- **Grace:** the displayed deadline is a promise to the customer. The server may keep seats up to about 5 minutes longer (cron cadence), never shorter, and accepts a proof uploaded in that window.
- A hold is never moved earlier than its existing effective deadline.

### D2. "Pay later" email, resume link and copy link

- Optional field inside the **I will pay later** area (inline card). Notice, verbatim: *"We'll email you a link and hold your seats for 24 hours. No email? Your seats are held for 60 minutes only. After that you'll need to start again."*
- The email is stored in a **new** column `guestResumeEmail`, never in `guest_email`. It is not an identity claim: it is never used to look up, merge or block registrations, and the hold extension it triggers is bounded by the IP cap (D4) and the admin release path (D5). Cleared on proof submit, cancel, release, both auto-cancel paths and by the retention job.
- **Email link** carries a signed token in the URL fragment: `/events/{slug}/register/resume#t=<token>` (D3).
- **Copy my link** (no email, no hold extension): the browser builds `/events/{slug}/register/resume#r=<registrationId>.<accessToken>` from the token it already holds. The resume page validates it with the existing `GET /registrations/guest/:id` call, stores the token in `sessionStorage` and continues. It involves no new endpoint, no rotation, and it stops working if the email link is later used (rotation) or the hold ends. The card warns: *"Anyone with a copied link can open your reservation, so don't share it publicly."*
- Success wording is deliberately conditional: *"If the address is right, your link is on its way to j***@example.com."*

### D3. Resume token (email link)

Format `v1.<registrationId>.<expiryEpochSeconds>.<signature>`; signature = HMAC-SHA256 over `guest-resume:v1:<id>:<exp>`, key derived from the existing private JWT key with **HKDF-SHA256** (info `axon:guest-resume:v1`), so no new secret is deployed. Expiry = the hold deadline. Rotating the JWT key invalidates outstanding links (intended).

Exchange (`POST /registrations/guest/resume`):
1. Reject malformed input by regex before any work.
2. Verify the signature (constant-time, equal-length buffers) and expiry **before any database access**.
3. Load the row; require `pending_payment`, `userId IS NULL`.
4. Rotate `guestAccessTokenHash` with a conditional update (`WHERE id AND guestAccessTokenHash = <read value> AND status = 'pending_payment'`); count 0 → generic 404 (so parallel exchanges: exactly one wins).
5. Return the new token with `Cache-Control: no-store`.

The token regex bounds the id segment (`[0-9a-f-]{36}`, a UUID). The HKDF call uses a fixed salt and the derived key is computed once and cached; the JWT private key must be the stable configured key (rotating it intentionally invalidates links). The signature check runs with no Prisma call (test spies on the client). A per-IP Redis limit of 20 exchanges per hour backs the soft throttle; it fails open because the signature cannot be forged.

Every failure returns the same 404 and body. Consequence, documented and designed: opening the email link on a second device silently ends the first device's session; the first device shows the "opened on another device" state and the email link remains reusable until the deadline.

### D4. Caps and reuse

- **Hold-creation cap:** Redis counter `guest-hold:<eventId>:<hmac(ip)>`, TTL 3600 s, cap `GUEST_HOLDS_PER_IP` (default **5**; raised from 3 because mobile carriers and venue Wi-Fi share IPs). IP comes from the existing helper (`x-real-ip`, else the last `x-forwarded-for` entry) and is only ever stored as a keyed hash. Over the cap: **409** `{ message, code: "GUEST_HOLD_LIMIT" }`; the increment just made is undone. Redis outage: fail open for the hold (checkout must keep working), warn log, accepted risk (a small in-memory per-instance counter is the fallback).
- **Decrement on release:** at creation the server also stores `guest-hold-reg:<registrationId>` (TTL 3600 s) holding the counter key. Cancel, release and cleanup decrement through a Lua script that only decrements when the value is above 0 and only if the mapping exists, so an expired key never goes negative or gains headroom.
- **Extended-hold cap (anti-hoarding):** Redis counter `guest-ext:<eventId>:<hmac(ip)>`, TTL 24 h, cap `GUEST_EXTENDED_HOLDS_PER_IP` (default **2**). `save-for-later` extends a hold to 24 hours only while this counter is under the cap. Beyond it the email is still sent (it still works as a link for the 60-minute hold) but the hold is **not** extended; the response carries the real, unchanged `holdExpiresAt` and the web shows the true deadline, never "24 hours". Admin release remains the backstop. Redis outage: no extension (fail closed).
- **Browser reuse (convenience only; the server never trusts it):** remember the active hold for the event in `sessionStorage`; on returning to checkout with the same tier and quantity and an unexpired hold, reuse it. If the remembered hold expired, create a new one and show the "Your earlier reservation expired, so we started a new one" note.
- Changing tier or quantity releases the previous hold (guest cancel) before creating the new one.

### D5. Release paths (one shared, transactional helper)

One helper locks the registration row (`FOR UPDATE`, parameterized), re-checks `status = 'pending_payment'` and zero proofs, releases add-on reservations, sets `cancelled`, releases tier capacity, **clears `guestResumeEmail`**, decrements the IP counter where applicable, and writes an audit row. It is used by every path:

| Path | Audit action | Reason / actor |
|---|---|---|
| Cleanup, deadline passed | `REGISTRATION_AUTO_CANCELLED` | `Guest checkout hold expired` |
| Cleanup, legacy 24 h | `REGISTRATION_AUTO_CANCELLED` | `Registration abandoned` (unchanged text) |
| Early-bird sale ended (`autoCancelExpiredRegistrations`) | `REGISTRATION_AUTO_CANCELLED` | `Sale period ended` (unchanged text, now via the helper, with the same row cap, ordering and time budget as D6; at build, confirm no `pending_payment` row with a proof was ever cancelled here, since the helper re-checks zero proofs) |
| Guest cancels | `REGISTRATION_CANCELLED` | metadata `by: guest` |
| Admin/organizer releases | `REGISTRATION_HOLD_RELEASED` | `performedById` |

Audit metadata never contains an email, a token or a registration secret; where an address must be referenced, only an HMAC of it.

### D6. Cleanup and reminder behavior

- **Cleanup:** two explicit branches (no `COALESCE`): `holdExpiresAt < now`, or `holdExpiresAt IS NULL AND createdAt < now − 24 h`. Capped at 100 rows per run, oldest `createdAt` first, with a 7-second time budget (rows are independent and idempotent, so a partial run is safe).
- **Reminder:** guests with a saved email get one reminder about 12 hours before `holdExpiresAt`, with the resume link (never the raw access token). An atomic Redis `SET NX` marker (`payment-reminder:<registrationId>`, 48 h) is set before sending and removed if the send fails, so overlapping 5-minute runs cannot duplicate. The marker also fixes the existing duplicate for logged-in registrations. If Redis is down, reminders are skipped, never duplicated.

### D7. Admin labels

The fallback "Walk-in attendee" is replaced in all six places (`admin.service.ts` ×2, `registrations.service.ts` ×2, `VerificationDrawer.tsx`, `admin/registrations/[id]/page.tsx`) by one rule: unpaid `pending_payment` with no attendee and no user → **Checkout started (no details yet)**; `paymentMethod = onsite_qr` → **Walk-in attendee** (these are real walk-ins); otherwise **Guest registration**. The Transactions subtitle becomes "All checkouts and payments — online and manual (GCash / bank transfer)." The Source badge stays **Manual**.

### D8. Funnel, analytics and tracker hygiene

- New funnel steps `hold_email_saved`, `hold_resumed`, `hold_expired_seen`, `hold_cancelled` (additive). Payloads carry no email, token or registration id.
- The internal funnel tracker, Sentry (breadcrumbs, transactions, replay) and the Meta Pixel must not receive URL fragments: `funnel.ts` sends `origin + pathname + search` only; Sentry gets `beforeSend`/`beforeBreadcrumb` scrubbers that strip `#…`; the resume route is added to the Pixel exclusion list; the resume page reads and removes the fragment (`history.replaceState`) before any analytics call.
- Scrubbing covers both `#t=` and `#r=`. Sentry Replay URL masking is enabled, and Vercel Analytics gets a `beforeSend` that strips the fragment (via a small client wrapper). Any other script that reads `location.href` is checked at the frontend gate. The resume page calls `history.replaceState` before any network or analytics call and routes by status (it never offers upload unless the registration is `pending_payment`).
- `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex, nofollow` headers for `/events/*/register/resume` in `next.config.mjs`; page metadata also `noindex, nofollow`.

### D9. Email abuse controls (save-for-later)

- Fixed-template email only (no user-supplied text), URL built from configured `webUrl` over HTTPS.
- Redis limits, all keys built with an **HMAC under a server-derived key** (not a plain hash, so keys cannot be enumerated): per registration 60 s cooldown and max 3 sends; **per recipient address 3 per 24 h across all registrations**; **per IP 10 per hour**.
- **Truthful uniform response:** whatever happens (sent, a limit hit, Redis down, hold not extended) the API answers the same 200 shape `{ message, holdExpiresAt }` with the registration's real current deadline. The web only says "held for 24 hours" when `holdExpiresAt` is actually that far away; otherwise it shows the true deadline. The message wording is conditional ("If the address is right, your link is on its way…").
- Redis outage: no email sent, no extension, same 200 shape (fail closed). Accepted risk: someone can burn a victim's 3-per-24-hour recipient quota (minor denial of service).
- Mail send timeout about 5 seconds. Provider failure → **503** with a generic message; the hold is not extended.

### D10. Log and response hygiene

- Add `req.headers["x-registration-token"]` (and `res.headers["set-cookie"]`) to the pino redact list, in **bracket notation**, and rewrite the existing `x-cron-secret` entry the same way (dot notation on a hyphenated key may not redact). A test logs a request with each sensitive header and asserts `[Redacted]`. Confirm no log, error serializer or Sentry capture includes the body of `POST guest/resume`.
- `findGuestById` returns an explicit allowlist (never `guestAccessTokenHash` or `guestResumeEmail`); `findByIdAdmin` stops returning `guestAccessTokenHash` and `guestResumeEmail` (adds `resumeEmailSaved`). Exports and lists are checked to never serialize the raw row.

## 4. Configuration (all optional; defaults shown)

| Variable | Default | Range | Purpose |
|---|---|---|---|
| `GUEST_HOLD_MINUTES` | `60` | 10–240 | Unpaid guest hold without an email. |
| `GUEST_HOLD_EXTENDED_HOURS` | `24` | 1–72 | Hold after a guest saves an email. |
| `GUEST_HOLDS_PER_IP` | `5` | 1–20 | Unpaid guest holds per IP per event per hour. |
| `GUEST_EXTENDED_HOLDS_PER_IP` | `2` | 1–10 | Extended (24-hour) guest holds per IP per event per day. |

Documented in `config/configuration.ts`, `config/env.validation.ts` (Joi), `.env.example` and `docs/environment-matrix.md`. No new secret. Uses `APP_ENV`, never `NODE_ENV`.

## 5. Database change (additive only)

Declared in `schema.prisma` (`holdExpiresAt DateTime? @map("hold_expires_at")`, `guestResumeEmail String? @map("guest_resume_email")`, `@@index([status, holdExpiresAt])`) and generated by `prisma migrate dev` on a throwaway local database so the SQL matches exactly:

```sql
ALTER TABLE "registrations" ADD COLUMN "hold_expires_at" TIMESTAMP(3);
ALTER TABLE "registrations" ADD COLUMN "guest_resume_email" TEXT;
CREATE INDEX "registrations_status_hold_expires_at_idx" ON "registrations"("status", "hold_expires_at");
```

- No new table, so no new RLS policy; no backfill; no change to existing columns; no index on the email column.
- **RLS posture (PII column):** production check (2026-10-02): `relrowsecurity = true`; `anon` holds the default table SELECT grant. With RLS on, anon sees rows only if a policy allows it, so the policy list must be empty or exclude `anon`/`public` (query filed in the ledger; UAT to be checked before its migration).
- **Rollback:** revert the application code; leave the columns (inert). The destructive column drops live **only in the PR description** as a manual emergency script, never in `migration.sql`, and may be run only if `SELECT count(*) FROM registrations WHERE guest_resume_email IS NOT NULL OR hold_expires_at IS NOT NULL;` returns 0. Index drop is safe on its own.
- **Retention:** `enforceAttendeeRetention` adds `{ guestResumeEmail: { not: null } }` **inside the `createdAt < cutoff` branch** next to `guestEmail` (the only branch a hold with no attendees and no proofs can match) and sets `guestResumeEmail: null` in its update. Test uses a hold with zero attendees and zero proofs. The clear also happens at every release path (D5) and on proof submit.
- **Concurrency:** every writer of the two columns (save-for-later, resume rotation, cleanup, cancel, release, proof submit) locks the row or uses a conditional `updateMany` on `status = 'pending_payment'` and checks the count; lock order registration → ticket tier (existing).
- **Deploy order: migration first, then API, then web.** CI already enforces this for production (`migrate-prod` before `deploy-api`); UAT runs `migrate-db` in its workflow while Vercel deploys in parallel, so UAT may show errors for the minutes before its migration finishes. The old API keeps working after the migration (nullable columns).
- Index build takes a short write lock on `registrations` (small table; sub-second).

## 6. API contract

All under `/api/v1`. Guest routes use `@Public()`, `@HttpCode(200)` on POSTs, and the `x-registration-token` header with the existing `assertGuestAccess`; `POST guest/resume` is registered before other `guest/:id` routes. Every endpoint has `@ApiOperation`. Envelope unchanged. Errors never contain an email, token or registration id; guest 404s use the existing "Registration not found" text.

| # | Method + path | Auth | Limits | Body (DTO rules) | Success | Errors |
|---|---|---|---|---|---|---|
| 1 | `POST /registrations/guest-intent` (existing) | Public | 10/min/IP + hold cap | unchanged; now **rejects** `quoteToken`, `inclusionSelections` | adds `holdExpiresAt` (ISO string) | **409** `{ code: "GUEST_HOLD_LIMIT" }` (new); others unchanged |
| 2 | `GET /registrations/guest/:id` (existing) | token | 30/min | none | explicit allowlist + `holdExpiresAt` (ISO or null) + `resumeEmailSaved` (boolean) | unchanged |
| 3 | `POST /registrations/guest/:id/save-for-later` | token | 5/min/IP (soft) + Redis limits (D9) | `{ email }`: `@IsEmail`, max 254, trim + lowercase | 200 `{ message, holdExpiresAt }` (uniform) | 400 invalid email or hold not active, 404 bad token, **503** mail provider failure (hold unchanged) |
| 4 | `POST /registrations/guest/resume` | Public (signed token in body) | 10/min/IP (soft) + Redis per-IP | `{ token }`: string, max 512, `^v1\.[A-Za-z0-9_-]+\.\d{1,13}\.[A-Za-z0-9_-]{43}$` | 200 `{ registrationId, eventSlug, guestAccessToken, holdExpiresAt }`, `Cache-Control: no-store` | 404 generic for every failure |
| 5 | `POST /registrations/guest/:id/cancel` | token | 5/min/IP | no body | 200 `{ message }` | 400 not cancellable (proof submitted), 404 bad token |
| 6 | `PATCH /admin/registrations/:id/release-hold` | JWT + `assertRegistrationAccess` first | global | `{ reason? }`: optional string, max 200, trimmed (the v1 UI does not send it) | 200 `{ message }` | 400 not a `pending_payment` hold (after the access check), 403/404 via access check |

- **429 (throttle)** can be returned by rows 1, 3, 4 and 5; the web shows one calm message for all of them (client rules, section 7). Row 1's new 409 `code` must survive the exception filter (verified by a test), and the web branches on `code`. The checkout e2e mock (`apps/web/e2e/checkout-critical.spec.ts`) is updated for the new fields and the 409.
- Nothing monetary is read or written by these endpoints; no client value decides a deadline, count or price.
- Each endpoint is O(1); cleanup and reminders are capped and time-budgeted for Vercel's 10 s limit.
- **Breaking-change check:** additive response fields only; new failure modes the web must handle: 409 `GUEST_HOLD_LIMIT` on guest-intent, and a 404 on `GET guest/:id` now meaning expired, cancelled or opened-elsewhere (distinct states in the web).

## 7. Screens and states

See the wireframes (desktop and phone, default/loading/error/success for every surface). Summary of surfaces: hold banner (static sentence in the live region, ticking digits hidden from screen readers, announcements at 10/5/1 minutes); inline "I will pay later" card (six states incl. invalid address, mail failure, rate limit, copied and copy-blocked); guest cancel (existing `ConfirmModal`, labels "Cancel reservation" / "Keep my seats"); expired (EmptyState), hold limit and opened-elsewhere (ErrorState); resume page (loading, success, retry, invalid, truncated link); admin release hold (existing `ConfirmModal`, no reason field in v1) and clearer labels. **Client rules:** (a) on a 404 from `GET guest/:id`, show *expired* if the locally known deadline has passed, otherwise the neutral *"We couldn't open this reservation here — it may have been opened on another device"* wording; (b) 429 on guest-intent, cancel or resume shows *"Too many attempts. Please wait a minute and try again."* with the page's normal action; (c) the cancel modal's 400 (proof already uploaded) shows *"This reservation can't be cancelled here"* with **Upload proof** and **Keep my seats**, and "Try again" appears only for network errors; (d) banner time format: under 60 minutes `42:10`; from 60 to 120 minutes `1 hr 12 min` (static, updated each minute); above 120 minutes the deadline date; screen-reader announcements at 10, 5 and 1 minute. One date helper everywhere: `Sat, Oct 3, 2026 · 9:30 AM`, Asia/Manila. Focus moves to the new content after every in-place swap. Registration funnel: no step moved or removed; conversion-relevant changes (60-minute hold, card before leaving, friendly errors) to be recorded as funnel sign-off in the ledger.

## 8. Test plan

- **API unit:** hold deadline helper (never moved earlier) and config bounds; Redis caps (hold cap with undo, mapping + guarded decrement never below 0, extended-hold cap leaves the hold at 60 minutes and returns the real deadline, outage behavior for each); HMAC-keyed limiter keys; token id regex; shared release helper (seats, add-ons, audit, idempotent, clears email, counter decrement); cleanup both branches incl. NULL handling, cap, time budget, untouched proof/attendee/logged-in rows; early-bird cancel via helper; guest-intent sets deadline, rejects add-ons, enforces and fails open on the cap; save-for-later (extends once, never touches `guest_email`, limits per registration/recipient/IP return uniform 200, mail failure → 503 and no extension, fails closed without Redis); resume (valid, tampered, expired, wrong version/length, malformed, wrong state; rotates hash; old token 404; parallel exchanges: one wins; no DB access before signature check); guest cancel and proof-upload race; admin release (access check first, wrong state 400); reminder marker (set before send, removed on failure, second run sends nothing, guests included, logged-in dedupe); retention clears `guestResumeEmail`; `findGuestById` and `findByIdAdmin` never return the hash or email; pino redact list; exports never include the email.
- **Web:** hold banner states, pay-later card states, copy-link, expired/cancelled/limit states, resume page states and fragment removal, tracker URL stripping; Playwright smoke for the public flow.
- **Golden paths after every phase:** registration (guest and logged-in), admin verification, event creation.
- **UAT script:** guest starts checkout → countdown → pay later with email → receives email → resumes in a second browser (first browser shows opened-elsewhere) → uploads proof; guest without email → hold ends at ~60–65 min → friendly expired state; 6th hold from one IP shows the limit message; admin releases a hold; reminder arrives once.

## 9. Rollout

1. Feature branch → PR into `uat` (UAT migration first) → UAT regression → PR `uat` → `main`. Ian merges.
2. Production: `migrate-prod` runs before `deploy-api`; web deploys after the API.
3. Rollback = revert application code; leave the columns.
4. After deploy: re-run the investigation queries; confirm new guest holds carry `hold_expires_at`, expire at ~60 minutes, and Query 5 stays empty.
