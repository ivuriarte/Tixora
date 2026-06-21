# Axon Tickets — Tech Debt & Deferred Work

---

## 🚧 NEXT MAJOR EPIC — Production Hardening + UAT Environment

**Updated:** June 21, 2026

### Current infrastructure status

- [x] **Vercel upgraded to Pro** — confirmed through the Vercel CLI. Both production projects are `Ready`.
- [x] **Supabase upgraded to Pro** — confirmed by the platform owner.
- [x] **Verify Supabase compute after the plan upgrade** — confirmed MICRO compute active ($0.01344/hr, 1 GB memory, 2-core ARM).
- [x] **Enable Vercel spend notifications and Supabase spend caps/budget alerts** — Vercel email notifications enabled to ivvuriarte@gmail.com.
- [ ] **Record vendor ownership and recovery access** — document which account owns Vercel, Supabase, DNS, Upstash, Cloudinary, Brevo/SMTP, Sentry, and GitHub; require MFA and at least one recovery administrator. *(Deferred)*

### Recommended environment model

Use the following model first. Do not build a separate persistent staging environment yet.

| Environment | Git branch | Web URL | API URL | Data |
|---|---|---|---|---|
| Production | `main` | `https://axontickets.online` | `https://api.axontickets.online` | Real attendees and payments |
| UAT | `uat` | `https://uat.axontickets.online` | `https://api-uat.axontickets.online` | Synthetic test data only |
| Preview | Feature/PR branches | Vercel-generated URL | Vercel-generated URL | UAT database only when integration testing is required |

**Why this model:** Vercel Pro currently includes one custom environment per project. Use that custom environment for durable UAT. Ordinary Preview deployments remain available for pull requests and short-lived QA. Add a separate persistent staging environment only when the release volume or team size genuinely requires it.

### Phase 1 — Environment architecture and safety controls

- [x] **Create an environment matrix document** — `docs/environment-matrix.md` lists every var, owner, secret flag, and value per environment.
- [x] **Add `APP_ENV=production|uat|development`** — added to `env.validation.ts` (Joi), `configuration.ts`, and both `.env.example` files. UAT runs `NODE_ENV=production` + `APP_ENV=uat`.
- [x] **Add an always-visible UAT banner** — `UatBanner.tsx` Server Component renders when `NEXT_PUBLIC_APP_ENV=uat`; shows truncated commit SHA from `VERCEL_GIT_COMMIT_SHA`. Added to root layout.
- [x] **Add an API environment marker** to `/api/v1/health` — returns `environment: "uat"|"production"|"development"` via `ConfigService.get('appEnv')`.
- [x] **Add startup safety assertions** — `assertUatSafety()` in `main.ts` blocks boot if `WEB_URL` or `API_URL` is production, or `PAYMONGO_SECRET_KEY` is a live key. Email sandboxing deferred to Phase 5.
- [x] **Define the release path** — `docs/release-process.md` documents the full branch flow, merge permissions, hotfix path, pre-merge checklist, and rollback procedure.
- [x] **Protect `main` and `uat` in GitHub** — both rulesets active (3 branch rules each, targeting 1 branch). Force pushes blocked, PR + approval required, deletions restricted. Status check gate deferred until Phase 6 CI workflows are built.

### Phase 2 — Supabase production hardening

- [x] **Use the Supabase transaction pooler for `DATABASE_URL`** — updated to port 6543 pooler with `?pgbouncer=true&connection_limit=1`. `DIRECT_URL` set to session pooler port 5432. `prisma/schema.prisma` updated to include `url` and `directUrl`. Health check confirmed: `database: ok`, `redis: ok`. Note: `APP_ENV` not yet set in Vercel production — `environment` field will appear after Phase 4.
- [x] **Create a database performance baseline** — `docs/db-baseline-jun2026.md` created. CPU ~0%, memory ~25–30%, disk 0.27 GB / 2 GB captured from Supabase Infrastructure. Active connections and cache hit rate rows are placeholders to fill in from Supabase Reports before the Francis Kong event.
- [x] **Review Supabase Query Performance/Advisors and add missing indexes** — migration `20260621120000_add_missing_indexes` adds 4 indexes: `registrations(tier_id, status)`, `registrations(status, created_at DESC)`, `tickets(ticket_tier_id, status)`, `registration_funnel_events(user_id)`. Run Performance Advisor in Supabase and add any additional findings to `docs/db-baseline-jun2026.md`.
- [x] **Confirm daily backups are available** — 8 consecutive daily physical backups confirmed (Jun 14–21 2026). Supabase Pro retains 7 days. Note: Cloudinary storage objects are not included — only database rows.
- [ ] **Run a documented restore drill** before the Francis Kong event. Deferred to Phase 3 — requires UAT database to be set up first so the drill does not touch production data.
- [x] **PITR decision: skip** — not required for 300–500 attendees. Weekly pg_dump provides off-platform recovery. Reassess when the acceptable data-loss window drops below one day.
- [x] **Create a weekly off-platform logical backup** — `.github/workflows/db-backup.yml` runs `pg_dump` every Sunday at 00:00 UTC. Backup stored as GitHub Actions artifact with 90-day retention. Requires `PRODUCTION_DIRECT_URL` secret added to GitHub repository settings.

### Phase 2B — 1,000-user readiness (concurrency, performance, load test)

**Capacity definition:** The current database can comfortably store records for 1,000 users. These tasks are required before claiming support for 1,000 users arriving or transacting within a short period. Certification requires a successful UAT load test, not only code review.

#### Phase 2B-P0 — Must do before Francis Kong event (security, correctness, concurrency)

- [x] **Rotate the Supabase database password** — new password set in Supabase, Vercel Production secrets updated, local `.env` updated. Health check confirmed `database: ok` after rotation (Jun 21 2026 14:40 UTC).
- [x] **Make attendee and legacy-ticket check-in atomic** — `admin.service.ts` now uses `updateMany` with `checkedInAt: null` (attendees) or `status: 'valid'` (legacy tickets) as the WHERE condition. `count = 0` is treated as already checked in. Audit log written only by the request that wins the race. All three check-in paths (QR scan attendee, QR scan ticket, manual attendee) fixed.
- [x] **Remove all in-process NestJS cron scheduling from the Vercel API** — Removed `@Cron` decorators from `SchedulerService` (3 methods) and `ReservationsService`. Removed `ScheduleModule.forRoot()` from `AppModule`. All jobs now run exclusively via GitHub Actions → HTTP `CronController` endpoints. Added two previously-missing endpoints (`cleanup-orphan-registrations`, `cleanup-otp-codes`) to `CronController` and `cron.yml`.
- [ ] **Define one authoritative inventory model**:
  - PostgreSQL must be the final source of truth for registrations, purchases, and capacity.
  - Redis may provide fast reservation counters/public availability, but it must be rebuildable from PostgreSQL.
  - Document reconciliation after Redis loss, failed transactions, cancellation, rejection, expiry, and admin quantity changes.
  - Add invariant checks proving available capacity never becomes negative and a tier cannot oversell.
- [ ] **Build the UAT concurrency test suite**:
  - Concurrent registration attempts against one nearly sold-out tier.
  - Duplicate/retried registration submissions with the same user and idempotency key.
  - Concurrent QR scans from at least three devices.
  - Reservation expiry while checkout is completing.
  - Pass requirement: zero oversells, zero duplicate successful check-ins, and no lost inventory.

#### Phase 2B-P1 — Latency and database efficiency (post-event or as time allows)

- [ ] **Cache public event metadata and listings**:
  - Replace unconditional `cache: 'no-store'` on homepage, featured events, and event details with 60–300 second revalidation.
  - Use cache tags or explicit invalidation after event/tier/admin changes.
  - Never publicly cache authenticated, attendee-specific, payment, or admin responses.
- [ ] **Cache public inventory separately from final checkout validation**:
  - Serve displayed availability from Redis or a 2–5 second cache.
  - Always revalidate capacity inside the PostgreSQL registration transaction before committing.
  - Invalidate/update the cache after registration, cancellation, rejection, approval, reservation expiry, and tier edits.
- [ ] **Remove write-on-read behavior from public event APIs**:
  - Stop calling `autoCompleteExpiredEvents()` from event listing requests.
  - Move event completion to the external scheduler.
  - Public `GET` requests must not run maintenance `UPDATE` statements.
- [ ] **Move email delivery out of critical API requests**:
  - Implement a transactional outbox table or durable queue.
  - Registration approval/creation commits the database state and queues email work.
  - A worker retries delivery with bounded attempts and records permanent failures.
  - Bulk approval must not launch large concurrent SMTP workloads inside one Vercel request.
- [ ] **Move admin pagination into PostgreSQL**:
  - `AdminService.listOrders()` currently loads all matching orders/registrations, merges them in memory, then slices.
  - `AdminService.getAttendees()` currently loads all matching attendees/tickets, merges them in memory, then slices.
  - Replace with database-level pagination using a view or `UNION ALL`, deterministic ordering, and indexed filters.
- [ ] **Make Prisma/serverless connection behavior explicit**:
  - Continue using the Supabase transaction pooler for runtime traffic.
  - Use the direct connection only for migrations and controlled administration.
  - Configure and document `connection_limit`, pool timeout, statement timeout, and expected maximum Vercel concurrency.
  - Alert on pool saturation and database connection exhaustion.
- [x] **Add indexes based on verified query patterns** — migration `20260621120000_add_missing_indexes` adds: `registrations(tier_id, status)`, `registrations(status, created_at DESC)`, `tickets(ticket_tier_id, status)`, `registration_funnel_events(user_id)`. Existing indexes already covered `event_id/status`, `eventId/step`, and `step/status` combinations. Run `EXPLAIN ANALYZE` on slow queries identified by Supabase Performance Advisor after first event.
- [ ] **Reduce non-critical funnel write pressure**:
  - Keep conversion telemetry best-effort.
  - Batch, queue, sample, or deduplicate high-frequency page-view/step events.
  - Add retention/archival rules so funnel data does not grow indefinitely.

#### Phase 2B-P2 — Operational scaling and optimization (post-launch)

- [ ] **Cache expensive admin analytics summaries** for 30–60 seconds and invalidate after relevant writes rather than recomputing multiple counts/groupings on every refresh.
- [ ] **Measure API bundle and cold-start overhead** — the current NestJS function bundle is approximately 71 MB. Remove unnecessary runtime dependencies only when traces show material startup cost.
- [ ] **Verify Vercel Fluid Compute configuration** and benchmark it under UAT concurrency before relying on it for event-day scaling.
- [ ] **Create retention policies** for OTP records, audit logs, funnel events, abandoned registrations, and obsolete payment proof metadata.
- [ ] **Keep Supabase Micro until metrics justify more compute** — upgrade to Small only when UAT shows sustained CPU, memory, connection, or disk-IO pressure. More compute is not a substitute for caching and query fixes.

#### Phase 2B — Load-test release gate

- [ ] **Create a realistic synthetic UAT dataset** with at least 1,000 users, 1,000 attendees, mixed registration statuses, payment proofs, audit logs, and at least 25,000 funnel events.
- [ ] **Run staged UAT load tests**, never write-load-test Production:
  - 50 concurrent users: baseline.
  - 100 concurrent users: normal launch target.
  - 250 concurrent users: expected peak.
  - 500 concurrent users: stress target.
  - 1,000 concurrent users: burst/capacity test, not the assumed steady state.
- [ ] **Required performance thresholds**:
  - Public cached event reads: p95 under 500 ms.
  - Registration transaction: p95 under 1 second, p99 under 2 seconds.
  - Check-in: p95 under 300 ms.
  - Error rate under 1%.
  - Zero oversells and zero duplicate successful check-ins.
  - No database/pool exhaustion, Vercel timeouts, or unexplained inventory drift.
- [ ] **Record and approve a capacity report** containing test version, dataset, traffic shape, p50/p95/p99, throughput, error rate, Supabase CPU/connections/IO, Redis usage, Vercel concurrency, bottlenecks, and final supported-user claim.

### Phase 3 — Supabase UAT isolation

- [x] **Create a separate Supabase UAT project** — UAT project `eiansrxggrvwzikpqhmt` created, all 16 migrations applied, seeded with realistic test data covering all 6 registration statuses. `DATABASE_URL_UAT` and `DIRECT_URL_UAT` set in local `.env`.
- [ ] **Store UAT DB URLs** in Vercel UAT environment only (done as part of Phase 4 after UAT project exists).
- [x] **Create migration commands that clearly target UAT** — `npm run db:migrate:uat` reads `DIRECT_URL_UAT`/`DATABASE_URL_UAT` from `.env` and runs `prisma migrate deploy` against UAT only.
- [x] **Add a migration safety check** — `prisma/check-migrate-target.ts` blocks any migration that points to the production project ref (`nwzfiftzubjppoitmzjs`) unless `--allow-production` is passed. Used by all `db:migrate:*` scripts.
- [x] **Replace the current seed script** — `prisma/seed.ts` rewritten: reads `SEED_ADMIN_EMAIL` from env, generates or uses `SEED_ADMIN_PASSWORD`, seeds 2 events × 3 tiers, 6 registrations covering all statuses, attendees, payment proofs, audit logs, and 2 checked-in QR tokens. Fully idempotent.
- [x] **Add a UAT reset command** — `npm run db:reset:uat` truncates all UAT tables (blocked on prod) then reseeds via `db:seed`.
- [ ] **Run restore drill before Francis Kong event** — process confirmed Jun 21 2026 (Supabase → Database → Backups → Restore to new project). Not executed yet to avoid $10/mo ongoing cost for a throwaway project. Do it ~1 week before first major event, verify data is intact, then delete the restored project immediately. Note: restoration does NOT include Cloudinary images, Edge Functions, or Auth settings — only DB schema, data, indexes, and roles.

### Phase 4 — Vercel UAT environment

- [ ] **Create a `uat` custom environment in both Vercel projects** (`tixora-online-ticket-app` and `api`).
- [ ] **Enable branch tracking for the Git branch `uat`** in both projects.
- [ ] **Attach persistent domains**:
  - Web: `uat.axontickets.online`
  - API: `api-uat.axontickets.online`
- [ ] **Configure environment-specific variables** for the Vercel UAT environments; do not copy Production secrets wholesale.
- [ ] **Set UAT CORS correctly** — API `ALLOWED_ORIGINS`/`WEB_URL` must contain only the UAT web domain and approved local development origins.
- [ ] **Enable Vercel Standard Deployment Protection** for Preview/UAT deployment URLs using Vercel Authentication. Do not make UAT anonymously public.
- [ ] **Create a protection bypass secret for automated Playwright tests** rather than disabling Deployment Protection.

### Phase 5 — External service isolation

- [ ] **Create a separate Upstash Redis database for UAT** — OTPs, rate limits, reservations, idempotency keys, and inventory must not share Production keys.
- [ ] **Add environment prefixes to Cloudinary folders**, for example `axon-tickets/prod/...` and `axon-tickets/uat/...`.
- [ ] **Sandbox UAT email**:
  - Route all outbound email to an allowlisted internal inbox, or use a provider test/sandbox mode.
  - Prefix subjects with `[UAT]`.
  - Block arbitrary attendee addresses at the API service layer.
- [ ] **Use PayMongo test keys only** in UAT, or disable online payment endpoints entirely until the test payment flow is intentionally exercised.
- [ ] **Use separate webhook secrets and callback URLs** for UAT.
- [ ] **Set Sentry environment/release tags** using `APP_ENV` and the Git commit SHA so UAT errors do not pollute Production triage.
- [ ] **Disable Meta Pixel and production analytics in UAT** to prevent test activity from contaminating business metrics.
- [ ] **Ensure UAT QR tokens cannot be accepted by Production** — use a different `QR_HMAC_SECRET` and validate event/environment boundaries.

### Phase 6 — CI/CD and release gates

- [ ] **Expand GitHub Actions triggers** to run lint, type-check, unit tests, and build checks on PRs targeting both `main` and `uat`.
- [ ] **Add a UAT deployment workflow** for Web and API using Vercel's UAT custom environment.
- [ ] **Run Prisma migrations before or during UAT deployment** with the UAT direct connection, then deploy the API only after migration success.
- [ ] **Add UAT smoke tests after deployment**:
  - Web home and event page return successfully.
  - API health reports UAT and healthy DB/Redis checks.
  - Login/OTP sandbox works.
  - Registration and proof upload work.
  - Admin verification produces QR tickets.
  - QR scan/check-in is atomic and rejects duplicate scans.
- [ ] **Run Playwright against the persistent UAT domain**, not an obsolete project alias.
- [ ] **Require a UAT sign-off record** containing build SHA, tester, date, tested scenarios, known issues, and approve/reject decision.
- [ ] **Add a manual Production promotion/deploy gate** after UAT sign-off. Avoid automatically deploying unapproved `main` commits while the event platform is active.
- [ ] **Document rollback separately for code and database** — Vercel rollback does not undo a Supabase migration.

### Phase 7 — UAT acceptance scenarios

- [ ] **UAT-01:** Solo attendee registration → OTP → proof upload → approval → QR email → check-in.
- [ ] **UAT-02:** Group registration with 5–10 attendees and one proof; verify caps, non-transferable tickets, and per-attendee QR generation.
- [ ] **UAT-03:** Proof rejection and re-upload, including attendee/admin email notifications.
- [ ] **UAT-04:** Three simultaneous admin reviewers approving/rejecting registrations; verify audit attribution.
- [ ] **UAT-05:** Three-device event-day check-in simulation with duplicate scans and manual lookup.
- [ ] **UAT-06:** Sold-out/race test — concurrent registrations cannot oversell a tier.
- [ ] **UAT-07:** Failure rehearsal — Redis unavailable, email unavailable, Cloudinary upload failure, and slow database response.
- [ ] **UAT-08:** Data isolation test — no UAT user, registration, proof, Redis key, analytics event, or email appears in Production.
- [ ] **UAT-09:** Reset test — reset UAT, reapply migrations, reseed, and rerun smoke tests without manual database repair.
- [ ] **UAT-10:** Stakeholder review on mobile and desktop with formal sign-off.

### Definition of done for the UAT epic

- [ ] UAT has persistent protected Web/API domains.
- [ ] UAT uses isolated database, Redis, email, upload, analytics, payment, webhook, and QR secrets.
- [ ] Production data is never copied into UAT.
- [ ] UAT can be reset and reseeded through a documented command.
- [ ] CI deploys and smoke-tests UAT repeatably.
- [ ] Production deployment requires recorded UAT approval.
- [ ] Rollback and database restoration have both been rehearsed.

### Platform references

- [Vercel environments and custom environments](https://vercel.com/docs/deployments/environments)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Vercel Deployment Protection](https://vercel.com/docs/deployment-protection)
- [Supabase branching](https://supabase.com/docs/guides/deployment/branching)
- [Supabase database backups and PITR](https://supabase.com/docs/guides/platform/backups)
- [Supabase compute, disk, and connection limits](https://supabase.com/docs/guides/platform/compute-and-disk)

---

## ✅ Shipped — May 29, 2026 (commits b398b52 · 1ebc068 · a855c69)

- **E2E base URL corrected** (`b398b52`) — Playwright config was pointing at the dead `axon-tickets-app.vercel.app` deployment. Updated to `tixora-online-ticket-app.vercel.app`. All 20 public-flow tests now pass (was 12 failures — all `DEPLOYMENT_NOT_FOUND`).
- **Homepage hero fits the viewport** (`1ebc068`) — Hero section constrained to `h-screen` with reduced padding (`py-8 md:py-12`), smaller title (`text-3xl/4xl/5xl`), smaller speaker name (`text-xl/2xl`), tighter margins throughout.
- **TS deprecation warning cleared** (`a855c69`) — Removed deprecated `baseUrl: "./"` from `apps/api/tsconfig.json`. Redundant since TS 4.1; flagged as deprecated in TS 5.9. Zero type errors confirmed post-removal.

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

- [ ] **Structured log drain** — Vercel Pro is now active. Add BetterStack or another supported log drain to both projects (API + Web), redact authorization/cookie/OTP fields, and validate an end-to-end test alert.
- [ ] **Environment-aware alerts** — route Production failures as urgent and UAT failures as non-paging notifications.
- [ ] **Vercel Observability baseline** — record function invocations, error rate, p50/p95 latency, cold starts, Fast Data Transfer, and monthly cost before the August event.
- [ ] **Supabase observability baseline** — create a monthly report for CPU, memory, connections, pooler clients, slow queries, database size, cache hit rate, and disk IO.
- [ ] **▶ UP NEXT — 4. Velocity + Cloudflare Turnstile** — rate-limit bundle purchases per IP, per device fingerprint, per email domain. Add **Cloudflare Turnstile** (free, invisible) or hCaptcha challenge **only on bundle-tier checkout** (low friction for legit buyers).
- [ ] **5. Staged release / virtual waiting room** — for hot events, gate bundles behind a queue OR sell bundles only via a separate **"request" flow with manual admin approval** (low-tech, very effective).
- [ ] **6. Payment-method binding** — refuse multiple bundle purchases from the same card / GCash number within 24 h.
- [ ] **7. Detection signals** — log `userAgent`, `Accept-Language`, headless-browser markers; auto-flag accounts created < 24 h before a bundle purchase.

The DB schema already supports #1 and #3 — `Ticket` rows hold per-seat attendee info, and `tier.maxPerOrder` is in place; we just need to recount across all orders per user instead of per order.

---

## Event Day Operations

### Pre-event API Warmup (do 30 min before doors open)

Vercel Pro is active, but serverless cold starts and external database connection setup can still affect the first requests. Treat this as a health/readiness rehearsal rather than a Hobby-tier workaround:

1. Open a terminal (or just run these in your browser dev console via `fetch`)
2. Make 3 requests to the health endpoint, 30 seconds apart:
   ```
   curl https://api.axontickets.online/api/v1/health
   ```
   Each should return: `{"status":"ok","checks":{"database":"ok","redis":"ok"}}`
3. Have a team member open the admin check-in page in their browser to warm the web container:
   ```
   https://axontickets.online/admin/checkin
   ```
4. After warmup, BetterStack pings every 3 min should keep both containers warm for the duration.
5. BetterStack production monitor must point to:
   ```
   https://api.axontickets.online/api/v1/health
   ```
   Do not monitor temporary or project-scoped `*.vercel.app` API aliases for production alerts.

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
