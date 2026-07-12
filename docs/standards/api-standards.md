# API Rulebook — Axon Tickets

**Who reads this:** the `api-architect` agent at the API gate, and any human designing endpoints.
**Plain-English goal:** every door into the server looks the same, requires the right key, and never trusts what a browser tells it.

---

## Hard rules (violating any = gate REJECT)

1. **Auth by default.** Controllers use `@UseGuards(JwtAuthGuard)` at class level; public endpoints opt out explicitly with `@Public()` (see `events.controller.ts`). A new endpoint without a guard and without `@Public()` is a bug.
2. **Never trust client-supplied computed values.** Prices, discounts, totals, quantities against caps — all recalculated server-side. Client sends *intent* (a code, a tier ID), server computes *outcomes*.
3. **Every request body has a DTO with validation decorators.** No raw `@Body() body: any`.
4. **Ownership checks on every resource access.** Organizer A must never read/export/modify organizer B's events, referrals, or attendees. Admin endpoints verify `isAdmin` server-side.
5. **No demographics (birthday, gender, city) in public responses.** Exports are aggregate-only with small-cohort suppression.
6. **Versioned paths:** everything lives under `/api/v1/...`. Breaking an existing response shape requires a new version, not an edit.
7. **Rate limiting stays on** (`THROTTLE_LIMIT=60`/60s/IP). Sensitive endpoints (OTP request, referral preview) keep their stricter limits.

## Design rules (findings to fix before approval)

8. **Consistent response envelope** — same success/data/error shape the web app already parses (`d.data`, `d.success`). New endpoints must not invent new shapes.
9. **Pagination convention:** `page` + `limit` query params, `limit` capped server-side (existing cap: 50).
10. **Swagger annotations required:** `@ApiTags`, `@ApiOperation` on every endpoint — the spec is the contract.
11. **Errors are structured and safe:** correct HTTP codes (409 for cap conflicts — existing pattern), no stack traces, no internal details, no secrets in error messages.
12. **Serverless-aware:** Vercel functions time out at 10s. No endpoint may do unbounded work; long jobs go to cron (`apps/api/src/cron`) or queues.
13. **CORS:** origins are an explicit allowlist. Adding one is a reviewed change.
14. **Breaking-change check:** removing/renaming a response field, changing its type, or tightening accepted input = breaking. The gate compares the proposed contract against what `apps/web` actually consumes.

## Process

- The endpoint contract (route, method, DTO, response shape, auth, rate limit) is written and reviewed **before** implementation.
- OTP codes and tokens never appear in logs.

## What the reviewer checks, in order

1. Guard present or explicit `@Public()`?
2. Any client-trusted value that should be server-computed?
3. DTO validation complete (types, ranges, formats)?
4. Ownership/authorization on the resource?
5. Response envelope + pagination consistent?
6. Any PII/demographics leaking into public shapes?
7. Breaking change vs. existing consumers?
8. Timeout-safe under Vercel's 10s limit?
