# Axon Tickets — Tech Debt & Deferred Work

---

## ✅ Shipped — May 28, 2026 (commit 81a363f)

### UX: 27 notification improvements across 16 files

All `alert()` calls, vague toast messages, and bare inline banners replaced with actionable, user-legible copy. Highlights:

| Severity | Count | What changed |
|---|---|---|
| Critical | 2 | `alert()` → `toast.error()`; `TierSelector` now branches on HTTP status (409 sold out, 401 session, 422 validation, no-connection) |
| High | 6 | Checkout payment/expiry, profile load, check-in search, admin registrations not-found + resend + verified banner heading |
| Medium | 9 | VerificationDrawer approve/reject include outcome; bulk reject is plural-aware; orders resend shows recipient email; event edit shows new status label with `STATUS_LABELS` map |
| Low | 10 | Admin page errors, Navbar sign-out, WEBP added to QR upload (client + `accept` attr), file-too-large with instructions, E2E test assertion updated |

**Security (no regressions):** 0 TS errors · 68/68 unit tests · No XSS / hardcoded secrets / SQL injection / open redirect · MIME type validation now consistent client ↔ server (JPG/PNG/WEBP)

**Playwright note:** 11 E2E public-flow tests return Vercel `DEPLOYMENT_NOT_FOUND` — Vercel infra issue on `axon-tickets-app.vercel.app`, not a code regression. API health tests (8 tests) all pass. 1 E2E test also fixed: admin redirect assertion updated to include `/auth/access`.

---

## ✅ Shipped — May 25, 2026 (commit 0b30148 → f26ab7a)

- **Group bundle single-receipt policy notices** — amber callout added to all 3 checkout touchpoints: event page tier selector (RegistrationPanel), attendee details form (RegistrationForm), and payment/proof upload page. Shown when qty > 1 or attendeeCount > 1.
- **Payment Options simplified** — RegistrationPanel now shows only provider type + name chips (E-Wallet: GCash · Maya / Bank Transfer: BPI · BDO). No account name or account number exposed before registration.
- **`tierId` added to `Registration` shared type** — was missing from `packages/types/src/registration.types.ts`; caused a Vercel build failure. Fixed in commit f26ab7a.

---

## ⏳ Audit Log Viewer (Admin UI)

**What:** The `AuditLog` table is being written to (registrations, proof uploads, admin actions, auto-cancellations) but there is no way to read it inside the app. Debugging requires direct DB access.

**What needs to be built:**
- **API:** `AuditService.findAll()` + `GET /admin/audit-logs` — paginated, filterable by `entityType`, `registrationId`, `performedBy`, and date range
- **Admin UI:** New page at `/admin/audit-logs` — table showing timestamp, action, entity type/ID, performed by, IP address, and expandable metadata

**Come back here and say: "implement the audit log viewer"** and it will be done in one session.

---

## ⚠️ NEXT UP — Admin Proof Alert Email

**What:** Right now, when an attendee uploads their payment proof (screenshot of GCash/bank transfer), the system sends an email to the **attendee** only ("We got your proof, we'll review it within 24 hours").

**The problem:** Nobody emails *you* (the admin/reviewer). You have to manually log in to the admin dashboard and check if new proofs are waiting. If you forget to check, attendees can wait longer than 24 hours — breaking the SLA promise in the confirmation email.

**What needs to be built:** When a proof is uploaded, automatically send an email to every admin account (everyone with `isAdmin = true`) saying: "New proof submitted — [Name], ref #XXXX, [event name]. Review it here: [link]"

**Why it's safe:** The code already knows all admin emails — it just queries the database for all admin users and emails them. No new config or accounts needed.

**Come back here and say: "implement the admin proof alert email"** and it will be done in one session.

---

## Security (OWASP A06 — Vulnerable Components)

### multer DoS — HIGH

- **CVEs:** 3 CVEs in multer ≤ 2.1.0 (malformed multipart = DoS)
- **Affected:** `apps/api` (file uploads: `/upload`, `/payment-proofs`)
- **Mitigating factor:** All upload endpoints require authentication — attacker needs a valid account first
- **Fix:** `npm audit fix --force` in `apps/api` → installs `@nestjs/platform-express@11` (NestJS major version bump — breaking change, needs full regression test)
- **Decision:** Deferred. Fix in a dedicated upgrade sprint before public launch.

### Next.js CVEs — HIGH

- **CVEs:** HTTP smuggling, DoS via Image Optimizer, Server Components DoS in Next.js 14.x
- **Affected:** `apps/web`
- **Mitigating factor:** DoS-only (no data theft/account takeover), self-hosted behind Vercel edge
- **Fix:** Upgrade to Next.js 15 (breaking App Router API changes — needs full UI regression)
- **Decision:** Deferred. Fix in a dedicated upgrade sprint before public launch.

### auth/orders/registrations controllers — LOW

- **Issue:** `x-forwarded-for.split(',')[0]` used in audit log IP extraction (NOT rate limiting — that is fixed)
- **Impact:** A spoofed IP appears in audit logs only; no security enforcement affected
- **Fix:** Apply same `x-real-ip`-first pattern from `throttler.guard.ts` to the three controllers
- **Decision:** Deferred. Low priority — logging only.

---

## E2E Test Drift

~~Resolved May 2026 — `admin-flows.spec.ts` already asserts Camera + Search only (2 tabs); no Manual tab reference remains.~~

---

- [ ] Upstash Redis Global (multi-region) — upgrade when monthly cost is acceptable (~$20–40/mo)
- [ ] Add structured alerting / on-call webhook for production errors

---

## Anti-Scalper — Group Bundle Hardening

Bundle tiers (1 purchase → many tickets) are the #1 scalper target. Mitigations below, layered. **Recommended first ship: #1 + #3 + #4 (Turnstile).**

- [x] **1. Per-account hard cap** — enforce `event.maxPerUser` across the user's whole event history (sums attendees from all non-cancelled/non-rejected registrations). _Shipped May 23, 2026 (RegistrationsService.create)._
- [ ] **2. KYC for bundle buyers** — at checkout, require **all attendee names + emails up front** for every seat in the bundle (not just the buyer). We already capture per-ticket attendee data — make it strict + required for bundle tiers.
- [x] **3. Named, non-transferable tickets** — `Attendee.transferable` flag added (default `false`); receipt page now shows "non-transferable + ID required at door" notice; admin check-in already returns the bound attendee name. _Shipped May 23, 2026._
- [ ] **Group receipt policy** — amber callout + 3-point checklist shown at all 3 checkout touchpoints when qty > 1. _Shipped May 25, 2026._ ✅

---

## Major Version Upgrades (dedicated sprint before public launch)

- [ ] **NestJS 10 → 11** — blocked by multer DoS fix (`npm audit fix --force`). Needs full API regression. Do together with multer CVE fix.
- [ ] **Next.js 14 → 15** — App Router API changes (breaking). Needs full UI regression. Do together with Next.js CVE fix.

---

## Observability (deferred — not blocking launch)

- [ ] **Structured log drain** — requires Vercel Pro ($20/mo). Two options when ready:
  - **Option A (recommended):** Upgrade to Vercel Pro → add BetterStack log drain to both projects (API + Web). Zero code changes.
  - **Option B (free):** Add `@logtail/pino` transport to NestJS app — ships logs from inside the process, no Vercel Pro needed.
  - Until then: use Vercel dashboard runtime logs (real-time, 1 hr history) for manual debugging.
- [ ] **▶ UP NEXT — 4. Velocity + Cloudflare Turnstile** — rate-limit bundle purchases per IP, per device fingerprint, per email domain. Add **Cloudflare Turnstile** (free, invisible) or hCaptcha challenge **only on bundle-tier checkout** (low friction for legit buyers).
- [ ] **5. Staged release / virtual waiting room** — for hot events, gate bundles behind a queue OR sell bundles only via a separate **"request" flow with manual admin approval** (low-tech, very effective).
- [ ] **6. Payment-method binding** — refuse multiple bundle purchases from the same card / GCash number within 24 h.
- [ ] **7. Detection signals** — log `userAgent`, `Accept-Language`, headless-browser markers; auto-flag accounts created < 24 h before a bundle purchase.

The DB schema already supports #1 and #3 — `Ticket` rows hold per-seat attendee info, and `tier.maxPerOrder` is in place; we just need to recount across all orders per user instead of per order.

---

## Event Day Operations

### Pre-event API Warmup (do 30 min before doors open)

Vercel Hobby serverless containers sleep after ~10 min of inactivity. BetterStack pings every 3 min keep them warm once the event is live, but you should manually warm before doors open:

1. Open a terminal (or just run these in your browser dev console via `fetch`)
2. Make 3 requests to the health endpoint, 30 seconds apart:
   ```
   curl https://api-ivvuriarte-5014s-projects.vercel.app/api/v1/health
   ```
   Each should return: `{"status":"ok","checks":{"database":"ok","redis":"ok"}}`
3. Have a team member open the admin check-in page in their browser to warm the web container:
   ```
   https://tixora-online-ticket-app.vercel.app/admin/checkin
   ```
4. After warmup, BetterStack pings every 3 min will keep both containers warm for the duration.

### Event-Day CSV Backup (download before doors open)

If the app goes down mid-event, your check-in staff need a printed fallback list. Download it before doors open:

```
GET /api/v1/admin/events/{eventId}/registrations/export
```
(Requires admin JWT — use the browser while logged into the admin dashboard, or use Postman/curl with your bearer token.)

Save the downloaded `.csv` to Google Sheets or print it. The columns are:
`Reference, First Name, Last Name, Email, Phone, Tier, Qty, Status, Payment Method, Total (PHP), Registered At, Checked In, First Check-In At`

### Check-In Staff Setup

- 3 staff members need admin accounts (or the same shared admin account on 3 devices)
- Each opens `/admin/checkin` in their browser — no app install needed
- QR scanner works on any camera-enabled device
- If a QR scan fails, use the **Search** tab to look up by reference number or name

### Multi-Admin Accounts (for proof reviewers)

For the Francis Kong event (3 core reviewers + volunteers):
- Have each reviewer **sign up** on the platform normally (they'll get a verified account)
- Go to `/admin/users` → find their account → click **Make Admin**
- **Important:** After promotion, ask them to **log out and log back in** — their existing session still has the old `isAdmin: false` claim in the JWT (15-minute window). The `/admin/users` page shows their current DB role in real time, so you can confirm the change took effect before they re-login.
- Each reviewer gets their own login so audit logs show who approved/rejected each proof
- Check-in staff can use the same reviewer accounts or separate ones — they only need `/admin/checkin` access
- Granular roles (reviewer-only vs full admin) is a post-launch backlog item

### ☑ Event Day Pre-flight Checklist

- [ ] **T-30 min:** Run pre-event API warmup (see "Pre-event API Warmup" above)
- [ ] **T-20 min:** Download and save CSV backup for all verified registrations (see "Event-Day CSV Backup" above)
- [ ] **T-15 min:** Open `/admin/checkin` on all 3 check-in devices to warm the web container
- [ ] **T-10 min:** Confirm all reviewers are logged in to admin with correct role
- [ ] **T-0:** Doors open — BetterStack keeps containers warm from this point

