# Tixora — Tech Debt & Deferred Security Items

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

## E2E Test Drift (must fix before next validation run)

- [ ] `admin-flows.spec.ts` — `'check-in page renders three tabs'`: expects a **Manual** button that no longer exists. Tab type is now `'camera' | 'search'` only. Fix: update assertion to check for Camera + Search only (2 tabs).
- [ ] `admin-flows.spec.ts` — `'manual tab: has an attendee ID input...'`: clicks a Manual tab that no longer exists → will throw. Fix: delete this test case entirely (the feature was removed May 24, 2026, commit `f479943`).

---

- [ ] Upstash Redis Global (multi-region) — upgrade when monthly cost is acceptable (~$20–40/mo)
- [ ] Add structured alerting / on-call webhook for production errors

---

## Anti-Scalper — Group Bundle Hardening

Bundle tiers (1 purchase → many tickets) are the #1 scalper target. Mitigations below, layered. **Recommended first ship: #1 + #3 + #4 (Turnstile).**

- [x] **1. Per-account hard cap** — enforce `event.maxPerUser` across the user's whole event history (sums attendees from all non-cancelled/non-rejected registrations). _Shipped May 23, 2026 (RegistrationsService.create)._
- [ ] **2. KYC for bundle buyers** — at checkout, require **all attendee names + emails up front** for every seat in the bundle (not just the buyer). We already capture per-ticket attendee data — make it strict + required for bundle tiers.
- [x] **3. Named, non-transferable tickets** — `Attendee.transferable` flag added (default `false`); receipt page now shows "non-transferable + ID required at door" notice; admin check-in already returns the bound attendee name. _Shipped May 23, 2026._
- [ ] **▶ UP NEXT — 4. Velocity + Cloudflare Turnstile** — rate-limit bundle purchases per IP, per device fingerprint, per email domain. Add **Cloudflare Turnstile** (free, invisible) or hCaptcha challenge **only on bundle-tier checkout** (low friction for legit buyers).
- [ ] **5. Staged release / virtual waiting room** — for hot events, gate bundles behind a queue OR sell bundles only via a separate **"request" flow with manual admin approval** (low-tech, very effective).
- [ ] **6. Payment-method binding** — refuse multiple bundle purchases from the same card / GCash number within 24 h.
- [ ] **7. Detection signals** — log `userAgent`, `Accept-Language`, headless-browser markers; auto-flag accounts created < 24 h before a bundle purchase.

The DB schema already supports #1 and #3 — `Ticket` rows hold per-seat attendee info, and `tier.maxPerOrder` is in place; we just need to recount across all orders per user instead of per order.
