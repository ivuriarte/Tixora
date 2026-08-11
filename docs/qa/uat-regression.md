# UAT regression automation

Axon runs deterministic checkout tests before merge and live UAT regression
tests after deployment. The post-deployment jobs share a concurrency group with
the scheduled suite so test runs never overlap an in-progress UAT release.

## Automated portfolios

### Customer portfolio

| Journey | Automated permutations |
| --- | --- |
| Event discovery | Desktop and mobile layouts; carousel rotation; event labels; filters; card images; featured action; Chromium, Firefox, and WebKit |
| Guest paid checkout | Single and bulk; payment first; attendee data; review; valid/invalid OTP; no account/profile persistence; confirmation; duplicate anti-scalper block |
| Logged-out account checkout | Single and bulk; one final OTP; named recipients; consent-based link/create; no pre-OTP profile disclosure |
| Logged-in checkout | Single ticket skips attendee entry; bulk requires recipient identities; no second OTP; existing-registration guard |
| On-site/walk-in | Email and no-email; tier and sub-event selection; immediate attendance; duplicate; capacity; disabled/non-sale event; no public profile lookup |
| Customer authentication | Real Gmail OTP and saved-session restoration when the controlled mailbox secrets are enabled |

### Admin and organizer portfolio

| Journey | Automated permutations |
| --- | --- |
| Event management | Required wizard fields; invalid navigation; dates; conference sponsors/FAQ; event editing and prepopulation |
| Payment/publication | Paid-event payment-method validation and free-event behavior through API service tests |
| Operations | Orders, verification surfaces, attendee roster, CSV/nametags, QR/manual check-in, analytics, on-site QR configuration |
| Ownership boundary | Organizer access is restricted to owned events and approved organizations |
| Live lifecycle | Isolated UAT event create -> tier -> publish -> public walk-in -> roster verification -> duplicate/capacity checks -> hard cleanup |

### Super Admin portfolio

| Journey | Automated permutations |
| --- | --- |
| Platform governance | User role management, organizer applications, service-fee settings |
| Authorization | Super Admin cross-event access; organizer denial for platform-wide users, governance, settings, and profile visibility |
| Safety | Self-admin removal blocked; anonymous access rejected; test mutations use deterministic identities only |

### Release-wide gates

| Gate | Enforcement |
| --- | --- |
| API regression | Complete Jest service/unit/security suite on every UAT deployment and weekly run |
| Accessibility | Programmatic labels, named controls, duplicate IDs, image alternatives, and responsive overflow |
| Performance | Repeated UAT navigation samples with p95 TTFB, DOM-ready, load, and first-contentful-paint budgets |
| Cybersecurity | Helmet/CSP/HSTS/CORS headers, anonymous authorization boundaries, DTO validation, PII/IDOR regression, QR signing, OTP throttling, dependency audit |
| Cross-browser | Public, checkout, walk-in, accessibility, performance, and security suites in Chromium, Firefox, and WebKit weekly |

The current bundled browser compatibility layer executes an eval-based shim in
Firefox. CSP therefore retains `unsafe-eval` for this release; removing it
causes checkout console violations. `object-src 'none'`, frame denial, strict
transport security, origin allowlisting, input validation, and authorization
remain enforced. Removing the shim and migrating to a nonce-based CSP is a
tracked defense-in-depth improvement, not represented as completed here.

All Playwright jobs retain screenshots, traces, video, JUnit, JSON, and HTML
reports on failure. The UAT deployment fails when the web app, API, or required
post-deployment browser suite fails.

## Required GitHub configuration

Repository variables:

- `RUN_UAT_ADMIN_E2E=true`
- `RUN_UAT_CUSTOMER_E2E=true`

Repository secrets:

- `UAT_VERCEL_AUTOMATION_BYPASS_SECRET`
- `UAT_TEST_ADMIN_EMAIL`
- `UAT_TEST_ADMIN_PASSWORD`
- `UAT_TEST_GMAIL_CLIENT_ID`
- `UAT_TEST_GMAIL_CLIENT_SECRET`
- `UAT_TEST_GMAIL_REFRESH_TOKEN`

The Gmail OAuth identity must have read-only access to the controlled inbox for
`ivvuriarte@gmail.com`. The automation reads only a newly received Axon OTP
whose subject matches the expected recipient and timestamp. The OTP and OAuth
tokens are never written to test output or browser storage state.

The deterministic admin UI portfolio always runs with test-only API fixtures;
it no longer skips when live credentials are unavailable. The separate
authenticated admin integration suite runs only when `RUN_UAT_ADMIN_E2E=true`
and all three UAT admin/Vercel secrets are configured. It creates a uniquely
named free event, exercises the complete public walk-in lifecycle, and removes
that event in a `finally` cleanup block.

The admin identity and database must remain UAT-only and must not share
credentials or records with production. Rotate the password if it has ever
been used outside the GitHub secret store. The authenticated customer project
likewise remains opt-in until the Gmail OAuth secrets are configured; the
deterministic customer checkout portfolio still runs on every release.

## What Playwright cannot certify as bug-free

Automation provides repeatable evidence, but it cannot guarantee the absence of
all defects. Human UAT remains necessary for:

- subjective visual quality, image focal point, copy tone, and brand accuracy;
- real email rendering across Gmail, Outlook, Apple Mail, dark mode, and spam
  classification;
- payment-proof readability and the organizer's human approval judgment;
- behavior on physical devices, weak mobile networks, assistive technologies,
  and browser/OS combinations outside the automated matrix;
- high-volume concurrency, provider outages, and long-running reliability;
- penetration testing, social engineering, and newly disclosed vulnerabilities;
- business-policy decisions such as whether anti-scalper rules are fair for a
  particular event.

These items should be sampled manually before production promotion even when
the full automated suite passes.

## Dependency-audit disposition

Compatible August 2026 security patches are pinned in the lockfile. NestJS
Swagger 11.4.6 pins `js-yaml` 5.2.1, so the root override reproducibly resolves
that transitive dependency to patched 5.2.3. A clean `npm ci` followed by
`npm audit --omit=dev --audit-level=high` is the CI gate; no production
dependency advisory may be Critical or High.

## Running locally

Deterministic customer regression:

```bash
cd apps/web
BASE_URL=http://127.0.0.1:3100 \
  npx playwright test \
    e2e/checkout-critical.spec.ts \
    e2e/onsite-registration.spec.ts \
    --project=chromium
```

Deterministic Admin/Super Admin UI regression (no credentials):

```bash
cd apps/web
PW_ADMIN_MOCKED=1 BASE_URL=http://127.0.0.1:3100 \
  npx playwright test e2e/admin-flows.spec.ts --project=admin-mocked
```

The API mocks exist only inside the Playwright browser context and cannot be
activated in an application build. The real customer and admin projects are
intentionally unavailable unless their required environment variables are
present; no application-side authentication bypass is provided.
