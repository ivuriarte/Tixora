# UAT regression automation

Axon runs deterministic checkout tests before merge and live UAT regression
tests after deployment. The post-deployment jobs share a concurrency group with
the scheduled suite so test runs never overlap an in-progress UAT release.

## Automated coverage

| Area                                   | Pull request              | After UAT deployment             | Weekly cross-browser             |
| -------------------------------------- | ------------------------- | -------------------------------- | -------------------------------- |
| Paid guest single and bulk checkout    | Chromium with mocked APIs | Chromium against UAT             | Chromium, Firefox, WebKit        |
| Duplicate guest protection             | Chromium with mocked APIs | Chromium against UAT             | Chromium, Firefox, WebKit        |
| Invalid and valid guest OTP behavior   | Chromium with mocked APIs | Chromium against UAT             | Chromium, Firefox, WebKit        |
| Logged-in single and bulk checkout     | Chromium with mocked APIs | Chromium against UAT             | Chromium, Firefox, WebKit        |
| Consent-based account linking          | Chromium with mocked APIs | Chromium against UAT             | Chromium, Firefox, WebKit        |
| Customer OTP login and stored session  | —                         | Chromium with controlled Gmail   | Chromium with controlled Gmail   |
| Admin navigation and operational flows | Chromium with mocked APIs | Chromium with mocked APIs        | Chromium with mocked APIs        |
| Admin/API integration                  | —                         | Chromium with isolated UAT admin | Chromium with isolated UAT admin |
| Public pages and API boundaries        | —                         | Chromium against UAT             | Chromium, Firefox, WebKit        |
| Discovery carousel and mobile layout   | —                         | Chromium against UAT             | Chromium, Firefox, WebKit        |
| Accessibility smoke checks             | —                         | Chromium against UAT             | Chromium, Firefox, WebKit        |
| Performance budgets                    | —                         | Chromium against UAT             | Chromium, Firefox, WebKit        |

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

The 24 admin UI scenarios always run with deterministic API fixtures; they no
longer skip when credentials are unavailable. The separate authenticated admin
integration suite remains disabled until Axon provisions a genuinely isolated
UAT database and UAT-only admin identity. The currently available UAT database
configuration resolves to the same host, database, and schema as the default
database, so creating or rotating an automation admin there is unsafe. Do not
set `RUN_UAT_ADMIN_E2E=true` until that isolation is independently confirmed.

Once isolated, the admin identity must be UAT-only and must not share
credentials or database records with production. Rotate the password if it has
ever been used outside the GitHub secret store.

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

The compatible August 2026 audit patches are pinned in the lockfile, including
`brace-expansion` 5.0.9. The repository blocks new critical advisories in CI.
At the time of this change, npm still reports two high-severity findings through
`@nestjs/swagger` 11.4.6 because that latest upstream release pins vulnerable
`js-yaml` 5.2.1 instead of patched 5.2.3. Axon does not pass public YAML input to
this package, which limits direct exploitability, but the advisory remains open
and must be upgraded when Nest publishes a compatible release. It is not
represented as remediated or silently ignored.

## Running locally

Deterministic checkout regression:

```bash
cd apps/web
BASE_URL=http://127.0.0.1:3100 \
  npx playwright test e2e/checkout-critical.spec.ts --project=chromium
```

Deterministic admin UI regression (all 24 scenarios, no credentials):

```bash
cd apps/web
PW_ADMIN_MOCKED=1 BASE_URL=http://127.0.0.1:3100 \
  npx playwright test e2e/admin-flows.spec.ts --project=admin-mocked
```

The API mocks exist only inside the Playwright browser context and cannot be
activated in an application build. The real customer and admin projects are
intentionally unavailable unless their required environment variables are
present; no application-side authentication bypass is provided.
