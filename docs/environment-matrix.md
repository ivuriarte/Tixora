# Environment Variable Matrix — Axon Tickets

**Updated:** June 21, 2026

This document lists every environment variable consumed by the API and Web apps, who owns it, whether the value is secret, and the expected value source per environment.

> **Rule:** Never copy production secrets into UAT. Generate separate credentials for each environment.

---

## Legend

| Column | Meaning |
|---|---|
| **Secret** | Must be stored in Vercel environment secrets, never committed to git |
| **Dev** | Local development (`.env.local`) |
| **UAT** | `uat` Vercel custom environment |
| **Production** | `main` Vercel production environment |

---

## API (`apps/api`)

| Variable | Secret | Dev | UAT | Production | Notes |
|---|---|---|---|---|---|
| `NODE_ENV` | No | `development` | `production` | `production` | Controls build optimisations. UAT uses production builds. |
| `APP_ENV` | No | `development` | `uat` | `production` | Distinguishes UAT from production at runtime. |
| `PORT` | No | `3001` | _(Vercel assigns)_ | _(Vercel assigns)_ | Only needed locally. |
| `API_URL` | No | `http://localhost:3001` | `https://api-uat.axontickets.online` | `https://api.axontickets.online` | Public API base URL. |
| `WEB_URL` | No | `http://localhost:3000` | `https://uat.axontickets.online` | `https://axontickets.online` | Used for email links and CORS. |
| `ALLOWED_ORIGINS` | No | `http://localhost:3000` | `https://uat.axontickets.online` | `https://axontickets.online,https://www.axontickets.online` | Comma-separated CORS allowlist. |
| `DATABASE_URL` | **Yes** | Local dev Supabase URL (pooler) | UAT Supabase project pooler URL | Production Supabase pooler URL | Must use transaction pooler (`?pgbouncer=true`). |
| `DIRECT_URL` | **Yes** | Local dev Supabase direct URL | UAT Supabase direct URL | Production Supabase direct URL | Used by Prisma Migrate only. |
| `REDIS_URL` | **Yes** | Local / Upstash dev instance | Separate UAT Upstash database | Production Upstash database | UAT must use a separate Redis database. |
| `JWT_PRIVATE_KEY` | **Yes** | Dev key pair | UAT key pair | Production key pair | RS256. Generate per environment. |
| `JWT_PUBLIC_KEY` | **Yes** | Dev key pair | UAT key pair | Production key pair | RS256. |
| `JWT_ACCESS_EXPIRY` | No | `15m` | `15m` | `15m` | |
| `JWT_REFRESH_EXPIRY` | No | `7d` | `7d` | `7d` | |
| `QR_HMAC_SECRET` | **Yes** | Dev secret (≥32 bytes) | UAT secret | Production secret | Must differ per env — UAT QR codes must not be accepted by production. |
| `SMTP_HOST` | No | `smtp-relay.brevo.com` | `smtp-relay.brevo.com` | `smtp-relay.brevo.com` | |
| `SMTP_PORT` | No | `587` | `587` | `587` | |
| `SMTP_USER` | **Yes** | Dev Brevo account | UAT Brevo account | Production Brevo account | |
| `SMTP_PASS` | **Yes** | Dev SMTP key | UAT SMTP key | Production SMTP key | |
| `SMTP_FROM_EMAIL` | No | `noreply@yourdomain.com` | `uat-noreply@axontickets.online` | `noreply@axontickets.online` | UAT from-address should be visibly different. |
| `SMTP_FROM_NAME` | No | `Axon Tickets Dev` | `Axon Tickets [UAT]` | `Axon Tickets` | UAT name prefix prevents confusion. |
| `CLOUDINARY_CLOUD_NAME` | No | Dev cloud | UAT folder prefix `axon-tickets/uat/` | Production folder prefix `axon-tickets/prod/` | Same cloud account is OK; use separate folder prefixes. |
| `CLOUDINARY_API_KEY` | **Yes** | Dev | UAT | Production | |
| `CLOUDINARY_API_SECRET` | **Yes** | Dev | UAT | Production | |
| `PAYMONGO_SECRET_KEY` | **Yes** | PayMongo test secret | PayMongo test secret | PayMongo live secret | UAT **must** use test keys. Startup assertion enforces this. |
| `PAYMONGO_PUBLIC_KEY` | **Yes** | PayMongo test public key | PayMongo test public key | PayMongo live public key | |
| `PAYMONGO_WEBHOOK_SECRET` | **Yes** | Dev webhook secret | UAT webhook secret | Production webhook secret | |
| `HCAPTCHA_SECRET` | **Yes** | `0x0000000000000000000000000000000000000000` (test bypass) | Test key | Production key | |
| `THROTTLE_TTL` | No | `60000` | `60000` | `60000` | |
| `THROTTLE_LIMIT` | No | `60` | `60` | `60` | |
| `OTP_HOURLY_LIMIT` | No | `10` | `10` | `10` | |
| `OPTIONAL_INCLUSIONS_ENABLED` | No | `false` until local feature testing | `true` for approved UAT events | `true` only after UAT sign-off and the production backup gate | Global kill switch. An event must also have `optionalInclusionsEnabled=true`; disabling this variable hides the catalog and rejects new inclusion quotes without deleting purchases. |
| `INCLUSION_QUOTE_TTL_MINUTES` | No | `15` | `15` | `15` | Validity of an authoritative quote. A consumed or expired quote cannot be reused. |
| `INCLUSION_PAYMENT_HOLD_MINUTES` | No | `120` | `120` | `120` | Initial stock-hold duration after registration creation and before proof submission. |
| `INCLUSION_REJECTION_GRACE_HOURS` | No | `24` | `24` | `24` | Stock remains reserved for this period after a proof is rejected. |
| `INCLUSION_REVIEW_HOLD_HOURS` | No | `168` | `168` | `168` | Maximum review hold after proof submission. Operational review must complete before this boundary. |
| `INCLUSION_DEFAULT_PLATFORM_FEE` | No | `50` | `50` | `50` | Fee used when a free-admission event has a positive inclusion basket and its legacy event fee is zero. |
| `SENTRY_DSN` | **Yes** | Optional | UAT DSN | Production DSN | Can share project; APP_ENV tag separates events. |

---

## Web (`apps/web`)

| Variable | Secret | Dev | UAT | Production | Notes |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | No | `http://localhost:3001/api/v1` | `https://api-uat.axontickets.online/api/v1` | `https://api.axontickets.online/api/v1` | Baked in at build time. |
| `NEXT_PUBLIC_APP_ENV` | No | `development` | `uat` | `production` | Controls UAT banner, analytics, and Sentry env tag. |
| `NEXT_PUBLIC_GIT_SHA` | No | _(empty)_ | _(set via `VERCEL_GIT_COMMIT_SHA` in next.config.mjs)_ | _(set via `VERCEL_GIT_COMMIT_SHA` in next.config.mjs)_ | Displayed in UAT banner. Auto-populated by Vercel. |
| `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` | No | Test site key | Test site key | Production site key | |
| `NEXT_PUBLIC_ENABLE_ONLINE_PAYMENT` | No | `false` | `false` | `true` | Feature flag for PayMongo flow. |
| `NEXT_PUBLIC_META_PIXEL_ID` | No | _(unset)_ | _(unset — disable in UAT)_ | Production Pixel ID | Unset in UAT to prevent polluting analytics. |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Optional | UAT DSN | Production DSN | |
| `MAPBOX_SECRET_TOKEN` | **Yes** | Dev token | UAT token | Production token | Server-only (map image proxy route). |
| `MAP_IMAGE_SIGNING_SECRET` | **Yes** | Dev secret | UAT secret | Production secret | |

---

## Notes

- Variables marked **Secret** must never appear in git history or client-side bundle output.
- `NEXT_PUBLIC_*` variables are baked into the client bundle at build time — treat them as public.
- `QR_HMAC_SECRET` and `JWT_*` keys must be unique per environment to prevent cross-environment token acceptance.
- UAT startup safety assertions (in `main.ts`) enforce the most critical rules at boot time.
