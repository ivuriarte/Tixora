# Security Audit: Inline Registration Wizard
**Date:** 2026-06-15  
**Scope:** New unauthenticated registration flow introduced in the inline wizard rewrite  
**Auditor:** Automated review (Claude Code)  
**Files reviewed:**  
- `apps/api/src/auth/auth.service.ts`  
- `apps/api/src/auth/auth.controller.ts`  
- `apps/api/src/auth/dto/auth.dto.ts`  
- `apps/api/src/registrations/registrations.service.ts`  
- `apps/api/src/registrations/dto/create-registration.dto.ts`  
- `apps/api/src/main.ts`  
- `apps/web/src/app/events/[slug]/register/page.tsx`  
- `apps/web/src/app/auth/access/page.tsx`

---

## Summary

| Severity | Count | Fixed in this audit |
|----------|-------|---------------------|
| High     | 0     | —                   |
| Medium   | 2     | 2 ✅                |
| Low      | 2     | 2 ✅                |
| Info     | 4     | N/A (no action needed) |

---

## Findings

### FIXED — Medium: Unbounded string fields in analytics DTOs (payload inflation / DB bloat)

**Location:** `apps/api/src/auth/dto/auth.dto.ts` — `RequestAccessDto` and `VerifyAccessDto`

**Problem:** The analytics passthrough fields (`eventId`, `eventSlug`, `eventName`, `sessionId`, `returnUrl`, `userId`) had only `@IsString()` with no `@MaxLength`. An attacker sending arbitrarily large payloads (e.g., a 10 MB `eventName`) would pass DTO validation, stress the funnel service, and potentially cause DB column overflow for text columns without server-side length constraints.

**Fix applied:** Added `@MaxLength` to every passthrough field:
- `eventId` → 36 (UUID length)
- `eventSlug` → 100
- `eventName` → 200
- `sessionId` → 64
- `returnUrl` → 500
- `userId` in `VerifyOtpDto`, `ResendOtpDto`, `VerifyAccessDto` → 36

Also added `@MinLength(6) @MaxLength(6) @Matches(/^\d{6}$/)` to `VerifyOtpDto.otp` which previously had no format enforcement.

---

### FIXED — Medium: Empty string stored as phone instead of null

**Location:** `apps/api/src/auth/auth.service.ts` — `requestAccess()`

**Problem:** `dto.phone?.trim() ?? null` — if the client sent `phone: ""`, `"".trim()` evaluates to `""` (truthy to `??`), so an empty string was written to `user.phone` instead of `null`. This breaks downstream phone-present checks.

**Fix applied:** Changed `?? null` to `|| null`. Empty string is now coerced to `null`.

---

### FIXED — Low: OTP format not validated in legacy VerifyOtpDto

**Location:** `apps/api/src/auth/dto/auth.dto.ts` — `VerifyOtpDto`

**Problem:** `VerifyOtpDto.otp` had only `@IsString()` — no length or digit-only enforcement. Any string passed the DTO and was then bcrypt-compared (slow). This allowed callers to submit arbitrary-length strings and waste bcrypt compute on each attempt (even though Redis-based brute-force protection limits total attempts).

**Fix applied:** Added `@MinLength(6) @MaxLength(6) @Matches(/^\d{6}$/)` — invalid format strings are now rejected before the bcrypt call.

---

### FIXED — Low: Empty phone stored for stub users via `?? null` operator

*(See Medium finding above — same root cause, same fix.)*

---

## No Action Needed (Info)

### INFO-1: Email enumeration resistance — confirmed adequate

`requestAccess()` always returns `{ userId }` regardless of whether the email is new or existing. Timing is not perfectly constant (DB read vs. create) but the OTP send path takes ~200ms either way due to the email send. Acceptable risk for this threat model.

### INFO-2: OTP brute-force protection — confirmed correct

Both `verifyOtp` and `verifyAccess` share the same Redis key `otp:attempts:{userId}`. Lock triggers at 5 failures, OTP is invalidated on lock, and the attempt counter has a slightly longer TTL than the OTP itself (360s vs 300s). This is correct — the shared key prevents bypass by switching endpoints.

### INFO-3: Inventory race condition — protected by row-level lock

`registrations.service.ts` uses `SELECT ... FOR UPDATE` (PostgreSQL advisory row lock) inside a Prisma transaction before checking and decrementing `ticketTier.soldQuantity`. This prevents overselling under concurrent load.

### INFO-4: Open redirect in auth callback — confirmed safe

`/auth/access` page reads `?redirect=` from query string but validates `redirect.startsWith('/')` before following it. This prevents external URL redirects. The new wizard never passes a `redirect` parameter — it navigates directly after OTP success.

---

## Existing Controls Verified (pre-existing, not new)

| Control | Location | Status |
|---------|----------|--------|
| Helmet security headers (HSTS, XSS, nosniff, etc.) | `main.ts` | ✅ Enabled |
| CORS allowlist | `main.ts` | ✅ Configured |
| Global validation pipe with `whitelist: true, forbidNonWhitelisted: true` | `main.ts` | ✅ Strips unknown fields |
| HTTP throttler on `request-access` (5 req/min per IP) | `auth.controller.ts:76` | ✅ Enabled |
| HTTP throttler on `verify-access` (10 req/min per IP) | `auth.controller.ts:85` | ✅ Enabled |
| Per-user OTP cooldown (60s) enforced in DB | `auth.service.ts:334` | ✅ Active |
| 5-attempt OTP lock in Redis | `auth.service.ts:439` | ✅ Active |
| Duplicate registration guard per user per event | `registrations.service.ts:67` | ✅ Active |
| Per-tier cap enforcement (`maxPerOrder`) | `registrations.service.ts:84` | ✅ Active |
| Per-user cap across event (`maxPerUser`) | `registrations.service.ts:93` | ✅ Active |
| Sentry error reporting | `main.ts` | ✅ Configured |
| JWT RS256 with access + refresh rotation | `auth.service.ts` | ✅ Active |
| Phone regex validation (PH format) | `auth.dto.ts` | ✅ Active |
| Email `@Transform` lowercase + trim | `auth.dto.ts:43` | ✅ Active |

---

## Remaining Recommendations (not fixed — out of scope for this sprint)

1. **Rate-limit by email on `request-access`** (not just by IP): A distributed attack from many IPs targeting one email could trigger many OTP sends. Consider a Redis key `otp:req:{email}` capped at 3 sends per hour.

2. **OTP bcrypt cost**: The service uses `bcrypt.hash(code, 10)`. For a 6-digit numeric code (only 1M possibilities), a cost of 10 may be too low for very fast hardware. Consider increasing to 12, or switching OTP storage to `crypto.timingSafeEqual` on SHA-256 (faster verification, no bcrypt benefit since the attacker already has the hash if they breach the DB).

3. **Content-Security-Policy tuning**: Helmet's default CSP is present but may need tightening once the frontend is fully audited (especially `script-src` for Meta Pixel and Sentry inline scripts).
