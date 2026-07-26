# Axon Tickets Release 2.0 — UAT Validation and Audit Record

**Assessment date:** 26 July 2026 (Asia/Manila)

**Release branch:** `codex/uat-ui-reconciliation`

**Application commit deployed:** `acf64d1f40f0f96f46ca9c2e076cb48d74b9ae77`

**Environment:** UAT only; no production deployment or production-data change was performed.

## Executive outcome

The Release 2.0 engineering candidate passed the automated implementation, migration,
browser-regression, responsive-layout, performance-budget, production-dependency, and
negative-security gates described below. The UAT web and API deployments are healthy.

This record is an engineering UAT result, not a production go-live authorization or a
formal third-party penetration/WCAG certification. Final business acceptance and
authenticated organizer/super-admin acceptance remain release-owner activities.

## Release scope validated

- Public discovery: Happening Now, Happening Soon, Upcoming Events, Events You Missed,
  search, and category filters.
- Automatic event labels: New, Sales End Soon, Few Remaining, Selling Fast, Online,
  Event Concluded, and Hottest Right Now.
- Hottest Right Now: rolling seven-day ranking using 70% approved-registration velocity
  and 30% unique approved purchasers/registrants, with a minimum of 10 approved
  registrations, a maximum of six results, and suppression when fewer than three events
  qualify.
- Manual-payment-only Release 2.0 registration; payment gateway, saved-card, and promo
  code interfaces are excluded.
- Guest registration with scoped access tokens and explicit, consent-based account
  activation.
- Running-event attendee details, configurable gender identity choices, separate race
  division, corrected Confirm Email label, and bib assignment only after payment-proof
  approval.
- Bib numbering reset by event and distance, with atomic counter handling.
- Claim-status tracking and merchandise summaries for running events.
- Attendee/masterlist export for Super Admin and the event creator, including after the
  event ends.
- Two-year attendee/payment-proof retention from record creation, including scheduled
  cleanup and audit handling.
- Basic public organizer profile, organizer self-management, and Super Admin visibility
  controls.
- Approved gross/net sales and average-order-value analytics definitions.

## Deployment and migration evidence

| Component | UAT target                           | Deployment evidence                              | Result                                          |
| --------- | ------------------------------------ | ------------------------------------------------ | ----------------------------------------------- |
| Web       | `https://uat.axontickets.online`     | `dpl_4ZCjAYsPbBTzLUCMEEEUoRxmTd2J`               | Ready; protected by Vercel SSO                  |
| API       | `https://api-uat.axontickets.online` | `dpl_Aw3m3Vcsycok2jYFVWiPtYQh4suM`               | Ready and healthy                               |
| Database  | UAT PostgreSQL only                  | `20260726153000_release_2_discovery_and_running` | Applied successfully; all 36 migrations current |

An authenticated deployment request returned HTTP 200 from the web deployment, displayed
the UAT banner and deployed commit `acf64d1`, rendered Release 2.0 discovery content, and
returned `X-Robots-Tag: noindex`.

The live API health check returned HTTP 200 with UAT environment, database, and Redis
healthy. The discovery and event-list contracts returned HTTP 200.

## Quality-assurance evidence

| Gate                                      | Evidence                                                         | Result |
| ----------------------------------------- | ---------------------------------------------------------------- | ------ |
| Clean dependency install                  | `npm ci`                                                         | Pass   |
| API lint, typecheck, build                | Workspace release gates                                          | Pass   |
| Web lint, typecheck, production/UAT build | Workspace release gates                                          | Pass   |
| Prisma validation                         | Release schema with UAT-compatible configuration                 | Pass   |
| API unit/integration regression           | 19 suites, 153 tests                                             | Pass   |
| Public and Release 2.0 browser regression | 28 Chromium tests                                                | Pass   |
| Performance budget test                   | 1 Chromium test, five navigation samples                         | Pass   |
| Responsive layout                         | Desktop and 375 × 812 mobile; no horizontal overflow             | Pass   |
| Structural accessibility                  | Unique IDs, image alternatives, named buttons, labelled controls | Pass   |
| UAT API CORS contract                     | UAT origin and `X-Registration-Token` preflight                  | Pass   |
| Direct protected-web smoke                | Authenticated Vercel deployment request                          | Pass   |

The 28-test browser suite covers public navigation and authentication entry points,
graceful 404 behavior, event detail, API health/contracts, unauthenticated admin
protection, all approved discovery sections, search/category empty states, mutually
exclusive discovery buckets, the Hottest contract, manual guest registration, explicit
account-activation consent, accessibility structure, and mobile overflow.

The legacy authenticated admin browser suite requires `TEST_ADMIN_EMAIL` and
`TEST_ADMIN_PASSWORD`, which were not present. Role authorization, event-creator export,
bib assignment, guest-token access, proof approval, retention, and related policy paths
were validated at the API service/test layer. An authenticated organizer/super-admin
business acceptance session should still be completed before production authorization.

## Performance audit

### Production web build through local UAT configuration

Five production-mode homepage navigation samples:

| Metric                 |      p50 |      p95 | Release budget |
| ---------------------- | -------: | -------: | -------------: |
| Time to first byte     |   7.7 ms |  37.3 ms |     < 1,500 ms |
| DOM content loaded     | 302.6 ms | 595.0 ms |     < 3,000 ms |
| Load event             | 303.1 ms | 595.9 ms |     < 5,000 ms |
| First contentful paint |  48.0 ms | 112.0 ms |     < 3,000 ms |

The production homepage route is 5.12 kB with 268 kB first-load JavaScript; shared
first-load JavaScript is 224 kB.

### Live UAT API

Twenty sequential, response-body-complete samples per endpoint:

| Endpoint            | HTTP |      p50 |      p95 |  Maximum |
| ------------------- | ---: | -------: | -------: | -------: |
| `/health`           |  200 | 193.2 ms | 371.6 ms | 378.1 ms |
| `/events`           |  200 | 261.2 ms | 352.0 ms | 386.0 ms |
| `/events/discovery` |  200 | 289.3 ms | 392.1 ms | 412.1 ms |

No tested endpoint exceeded 500 ms at p95.

## Cybersecurity audit

### Passed controls

- Production dependency audit: **0** known vulnerabilities across 565 production
  dependencies.
- Unauthenticated `/admin/events`: HTTP 401.
- Invalid discovery category: HTTP 400.
- Invalid guest registration ID/token: HTTP 404 without registration disclosure.
- SQL-injection-shaped search input: safely handled as data; HTTP 200.
- Trusted UAT CORS preflight: exact UAT origin allowed and
  `X-Registration-Token` accepted.
- Untrusted-origin CORS preflight: no `Access-Control-Allow-Origin` returned.
- Web response controls: CSP present, HSTS present, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, strict-origin referrer policy, and restrictive
  permissions policy.
- UAT search-engine protection: noindex metadata and response header.
- Release diff secret-pattern review found no production credential. Matches were
  limited to explicit test fixture tokens.
- Scoped guest tokens are stored as hashes; account activation requires explicit
  consent.
- Bib assignment is approval-gated and uses an atomic per-event/per-distance counter.
- Attendee export remains role- and ownership-protected.

### Residual development-tooling risk

The full development audit reports 33 high-severity transitive findings in local
build/test tools (the ESLint 8, Jest 29, and Nest CLI dependency trees). They are absent
from the production dependency graph and are not shipped in the runtime deployment.
The registry's proposed remediations include incompatible major changes or incorrect
downgrades; applying them automatically would introduce greater release risk. Track
their upstream upgrades separately and keep CI inputs trusted.

## Data and acceptance notes

- Existing pre-Release-2.0 UAT events receive the migration's safe default category.
  Event owners should review and classify legacy events before business sign-off so the
  category filters demonstrate representative data.
- UAT is intentionally SSO-protected. Automated browser flows used the exact production
  build configured for the live UAT API, while live origin CORS and the protected
  deployment response were validated independently.
- Accessibility checks are automated structural and responsive checks, not an
  independent WCAG conformance certification.
- No production deployment, production migration, payment-gateway activation, saved
  card feature, or promo-code feature was performed.

## Recommendation

The candidate is suitable for business UAT. Before production authorization:

1. Complete an authenticated organizer and Super Admin acceptance session covering event
   configuration, proof approval, bib assignment, claim status, organizer profile, and
   post-event masterlist export.
2. Reclassify legacy UAT events and validate representative Hottest/Selling Fast/Few
   Remaining data.
3. Obtain Product Owner/CEO acceptance against the approved discovery backlog.
4. Repeat the automated release gates against the exact production candidate; production
   deployment remains a separately authorized action.
