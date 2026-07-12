# Axon Tickets (Tixora) — Agent Skill File

Read this entire file before editing any code. These rules are non-negotiable.

---

## Project Snapshot

Online ticketing platform for Philippine events. Monorepo: `apps/api` (NestJS), `apps/web` (Next.js 15 App Router), `packages/` (shared types/utils). Database: PostgreSQL via Prisma + Supabase. Deployed on Vercel (serverless). Currency: **PHP pesos**.

**Environments:**

| Env | Branch | Web | API |
|---|---|---|---|
| Dev | Feature branch | localhost:3000 | localhost:3001 |
| UAT | `uat` | uat.axontickets.online | api-uat.axontickets.online |
| Production | `main` | axontickets.online | api.axontickets.online |

---

## Critical Domain Rules

Violating any of these blocks deployment or breaks production.

### Monetary Values
- All prices are stored as **PHP pesos (integers)**. A ₱500 ticket: `price = 500`.
- **Never** store or convert to centavos. `price * 100` and `price / 100` in business logic is wrong.
- Display formatting (e.g. `toFixed(2)` for rendering) is the only allowed exception.
- This burned us before. Do not repeat it.

### Authentication
- Phone number is **required** for all registrations. Email alone is not sufficient.
- Google OAuth has been removed. OTP via email is the only auth flow.
- Never trust `isAdmin`, ownership, or role claims from the client. Always verify server-side.
- Session tokens must comply with storage compliance requirements.

### Referral System
- Discounts are **always calculated server-side**. Client-supplied discount amounts are ignored and must never be applied.
- Percentage discounts: max 100%. Fixed discounts: minimum result is ₱0 — no negative totals.
- Concurrent redemptions are serialized with a PostgreSQL advisory lock (per event+code). Do not remove this lock.
- Referral snapshots are immutable once stored on a confirmed registration.

### Database Migrations
- Migrations against production must be **additive only**.
- Never `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, or `ALTER` to remove a populated column.
- Emergency rollback = revert application code, not the schema.
- Migration `20260704180000_add_product_packages_mvp` added referral/demographic tables. If rolling back app code after data was written, do **not** drop those tables — it destroys captured data.
- Every migration PR must include documented rollback SQL before it merges.

### Environment Variables
- Use `APP_ENV` for environment checks. `process.env.NODE_ENV` is banned.
- Never commit secrets. Update `.env.example` when adding new env vars.
- Update `docs/environment-matrix.md` when adding new env vars.

### Row-Level Security (RLS)
- Every new Supabase table requires an RLS policy before it ships.
- Never disable RLS on a table without explicit written sign-off.

### File Uploads
- Sponsor logos: JPG, PNG, WebP only. SVG is rejected. File-size limits enforced.
- Sponsor links and custom-section links: HTTPS required.

---

## Security Rules

These come from the audit reports in `reports/`. Every code review must check these.

- No `$queryRaw` with template literals. Parameterized queries only.
- No raw HTML rendering sinks. All user content goes through React's text renderer.
- Referral administration and export endpoints require authenticated event ownership.
- Public event API responses must never expose attendee demographics (birthday, gender, city).
- Demographic exports: aggregate-only, with small-cohort suppression.
- Rate limiting is `THROTTLE_LIMIT=60` per 60s per IP. Do not remove it.
- OTP codes must never appear in browser console logs or server logs.
- CORS is scoped to known origins. Adding a new origin requires review.

---

## Release Gates

### Before every push to `uat` or `main`
- [ ] `npm run lint` passes in affected app
- [ ] `npm run typecheck` passes (Turbo) or `npx tsc --noEmit` per app
- [ ] `npm test` passes in `apps/api`
- [ ] No new `process.env.NODE_ENV` introduced
- [ ] No secrets committed
- [ ] `.env.example` updated if new env vars added
- [ ] Migration files reviewed if `prisma/migrations/` changed

### Before merging `uat` → `main` (production)
- [ ] UAT sign-off filed: build SHA + tester + date + scenarios tested
- [ ] No open P0 bugs
- [ ] Migration is backwards-compatible, or downtime window agreed
- [ ] Rollback SQL documented in the PR

---

## Golden Paths — Test After Every Change

Regressions in these flows are P0 bugs.

1. **Registration**: event page → register → OTP → profile → ticket select → payment proof upload → admin approve → QR email → check-in
2. **Referral**: apply code → verify discount is server-calculated → confirm snapshot stored immutably
3. **Admin verification**: login → queue → approve registration → confirm ticket issued + audit log written
4. **Event creation**: create event → publish → verify visible on public event listing

---

## Code Review Checklist

Run through this on every diff before approving or pushing.

1. Monetary values used correctly? (pesos, not centavos)
2. Any new endpoint trusting client-supplied values it should compute server-side?
3. New DB tables have RLS policies?
4. New migrations are additive only?
5. Any `process.env.NODE_ENV` introduced?
6. Any secrets hardcoded?
7. Any endpoint exposing demographics to unauthorized callers?
8. File upload validation present and strict on new endpoints?
9. New API routes protected by auth middleware?
10. TypeScript strict mode respected — no untyped `any` without justification?

---

## Post-development hooks

| Trigger | What runs | Purpose |
|---|---|---|
| `git push` | `scripts/hooks/pre-push.sh` | Pattern checks + migration safety + type-check |
| Claude Code session end | `scripts/hooks/claude-stop.sh` | Remind to run `/code-review` before PR |
| Before PR | `/code-review --comment` | Post findings inline on GitHub |
| After `/code-review` | verifier agent | Independently confirm/reject findings |
| PR with security scope | `/security-review` | Deep security audit of changes |
| Verifying a fix | `/verify` | Run golden paths in browser |

To install git hooks on a fresh clone: `bash scripts/install-hooks.sh`

---

## Stack Reference

- **API**: NestJS, Prisma ORM, PostgreSQL, Redis (Upstash), Resend (email), Cloudinary (uploads)
- **Web**: Next.js 15 App Router, TypeScript strict, Zustand (auth store), Tailwind
- **Shared**: `@axon-tickets/types` (response envelopes), `@axon-tickets/utils`
- **Build**: Turborepo, Vercel serverless
- **Tests**: Jest (API unit tests), Playwright (E2E smoke, public flows)
- **CI**: GitHub Actions — lint+typecheck → API tests → E2E smoke → migrate prod → deploy API
