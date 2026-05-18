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

## Infrastructure

- [ ] Upstash Redis Global (multi-region) — upgrade when monthly cost is acceptable (~$20–40/mo)
- [ ] Add structured alerting / on-call webhook for production errors
