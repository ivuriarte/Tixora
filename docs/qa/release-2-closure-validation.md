# Axon Tickets Release 2 Closure — Validation Record

Status: Deployed to UAT and post-deployment validation passed

Target: UAT

Business timezone: Asia/Manila

Scope: Remaining Release 2.0 outcomes and Release 2.1 executive calculation layer

## Delivered acceptance coverage

| Backlog outcome               | Verification                                                                                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registration-closed discovery | Future events with every tier closed, or a sold-out status, move to Events You Missed and receive a clear closure label.                                                                          |
| Running age-group integrity   | Overlaps and gaps are rejected; birthday is mandatory; event-day age and age-group name are stored with the attendee.                                                                             |
| Audited bib reassignment      | Only verified attendees on running events can change to a configured distance; a required reason and both old/new bib values are audited; the destination counter allocates a new bib atomically. |
| Merchandise operations        | Organizer filters cover distance, race division, size, and claim status; aggregated CSV uses the same filters and is audited.                                                                     |
| Organizer-profile takedown    | Super Admin hide/restore requires a reason, records previous state, and is available in the governance UI.                                                                                        |
| Sensitive exports             | Event creator and Super Admin only; access remains after event end; successful and denied attempts are audited.                                                                                   |
| Executive metric dictionary   | Contract v2.1 defines sources, exclusions, date rules, currency, timezone, formulas, limitations, reconciliation, and versioning.                                                                 |
| Executive dashboard           | Super Admin global date range; platform, financial, timeline, demographic, and organizer-performance views; audited reconciled CSV export.                                                        |

## Automated validation evidence

| Portfolio                                                            | Result                                                                                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Prisma client generation and schema validation                       | Passed                                                                                                 |
| API lint and TypeScript                                              | Passed                                                                                                 |
| Web lint and TypeScript                                              | Passed                                                                                                 |
| API production build                                                 | Passed                                                                                                 |
| UAT-configured web production build                                  | Passed; 43 static/dynamic application routes generated                                                 |
| API unit/service portfolio                                           | 26 suites, 193 tests passed                                                                            |
| Admin and Super Admin browser portfolio                              | 35 of 35 passed                                                                                        |
| Customer/public/accessibility/performance/security browser portfolio | 52 of 52 runnable scenarios passed                                                                      |
| Post-deployment UAT browser regression                               | Passed                                                                                                  |
| Post-deployment authenticated Admin/Super Admin regression           | Passed                                                                                                  |
| Dependency audit                                                     | 0 vulnerabilities across installed dependencies                                                        |
| Source diff quality                                                  | `git diff --check` passed                                                                              |

## Performance result

Five production-build homepage samples on the validation machine:

| Metric                 |      p50 |      p95 |   Budget |
| ---------------------- | -------: | -------: | -------: |
| TTFB                   |   3.5 ms |   5.2 ms | 1,000 ms |
| DOM Content Loaded     | 261.7 ms | 470.0 ms | 3,000 ms |
| Window Load            | 266.4 ms | 505.4 ms | 4,000 ms |
| First Contentful Paint |  32.0 ms |  44.0 ms | 2,500 ms |

These local figures validate regressions and budget compliance; they are not a substitute for geographically distributed production monitoring.

## Security controls verified

- Admin and Super Admin role boundaries are enforced server-side.
- Executive endpoints and exports are Super Admin only.
- Organizer event exports are scoped to the actual event creator; existence is not disclosed on denial.
- Sensitive export success and denial paths produce audit records with actor, scope, filters, result, and row counts where applicable.
- CSV output neutralizes spreadsheet-formula prefixes.
- New analytics ranges are validated, capped at five years, and calculated in Asia/Manila.
- Explicit `is_test` markers replace hidden email/title heuristics for KPI exclusion.
- Standard security headers, CORS behavior, anonymous admin rejection, DTO stripping, and error redaction passed browser regression.
- Installed dependency audit reports zero known vulnerabilities.

## Post-deployment gates — completed

1. Applied the additive Prisma migration to the isolated UAT database.
2. Deployed API and web from the same release commit.
3. Confirmed API health and web availability.
4. Confirmed anonymous requests to the new executive analytics endpoint return 401.
5. Ran the isolated Admin/Super Admin lifecycle portfolio successfully.
6. Ran the post-deployment browser portfolios and retained their Playwright artifacts in GitHub Actions.
7. Confirmed the executive definitions, dashboard, and CSV report use calculation contract version 2.1.

Deployment workflow: <https://github.com/ivuriarte/Tixora/actions/runs/31716832663>

Verified release commit: `65fe8f4d1e6b4ecbe645038c4c163bff0dc51977`

## Known calculation limitations

- Historic stock metrics use current organizer/event status with historical dates because status-history snapshots do not yet exist.
- Refunds are treated as full-order refunds because there is no partial-refund ledger.

Both limitations are versioned in the metric dictionary. Changing either rule requires a new calculation-contract version and migration plan.
