# Axon Tickets Executive Metric Dictionary — Release 2.1

Status: Implemented contract v2.1

Owner: Product and Data

Business timezone: Asia/Manila

Currency: PHP

Dashboard refresh target: 15 minutes

## Purpose

This is the authoritative calculation contract for the Super Admin executive dashboard. The API endpoint `GET /api/v1/admin/analytics/executive/definitions` exposes the same versioned dictionary so the application and this document can be reconciled during every release. The dashboard and CSV export both call the same calculation service; exports cannot silently diverge from the screen.

## Global rules

- One date range applies to all flow metrics and charts.
- Stock metrics (organizers, events, and user accounts) are measured as of the selected end date.
- Current event and organizer status is evaluated against the selected end date. Because Release 2.1 does not yet maintain status-history snapshots, a report for a past end date reflects the record's current status with its historical creation/start/end dates; it is not a restatement of a prior status snapshot.
- Transaction flow metrics include records completed inside the inclusive range.
- Records explicitly marked `is_test = true` are excluded.
- Hard-deleted records are absent by definition. Future merge or soft-delete workflows must preserve a canonical-record reference before changing this contract.
- Money is calculated from stored decimal transaction values and serialized as PHP numbers. Presentation rounding must never change stored calculations.
- A refunded order is treated as a full refund because the current order model does not store partial-refund amounts. A future partial-refund ledger requires a calculation-contract version change.
- Guest payer uniqueness uses a normalized email only inside the calculation process; raw email is not returned by the executive endpoint.
- Organizer performance uses the organization attached to each event and is sorted by Net Sales, then Successful Transactions, then organizer name.

## Metric definitions

| Metric                      | Calculation                                                             | Source                                | Key exclusions                                        |
| --------------------------- | ----------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------- |
| Total Organizers            | Count approved organizations as of range end                            | `organizations`                       | test, rejected, suspended, revoked                    |
| Active Organizers           | Approved organizers with at least one active event                      | `organizations`, `events`             | test and ended events                                 |
| Inactive Organizers         | Total minus active organizers                                           | derived                               | same as Total Organizers                              |
| Overall Events              | Count events created by range end                                       | `events`                              | test only; cancelled remains visible                  |
| Active Events               | On-sale or sold-out event whose effective end has not passed            | `events`                              | test, draft, cancelled, completed                     |
| Finished Events             | Completed event or non-cancelled event whose effective end passed       | `events`                              | test, cancelled                                       |
| Total User Accounts         | Count customer accounts by range end                                    | `users`                               | admins, test accounts                                 |
| Successful Transactions     | Paid/later-refunded orders plus verified registrations                  | `orders`, `registrations`             | pending, failed, rejected, cancelled, test event/user |
| Tickets Issued              | Non-cancelled tickets plus attendee records for successful transactions | `tickets`, `attendees`                | cancelled tickets and unsuccessful registrations      |
| Gross Sales                 | Sum approved transaction `total`, before refund subtraction             | `orders.total`, `registrations.total` | unsuccessful and test transactions                    |
| Refunds                     | Sum transactions in refunded status                                     | `orders.total`                        | non-refunded orders                                   |
| Net Sales                   | Gross Sales − Refunds                                                   | derived                               | —                                                     |
| Platform Fees               | Sum approved transaction `fees` before refund deduction                 | `orders.fees`, `registrations.fees`   | unsuccessful and test transactions                    |
| Average Order Value         | Gross Sales ÷ Successful Transactions                                   | derived                               | zero denominator returns 0                            |
| Average Spend / Paying User | Gross Sales ÷ unique paying identities                                  | user id; normalized guest email       | duplicate identities within range                     |
| Average Customer Age        | Mean completed age at range end                                         | `users.birthday`                      | missing/invalid birthdays, admins, test accounts      |
| Age Data Coverage           | valid birthday customer accounts ÷ included customer accounts           | `users`                               | admins and test accounts                              |

## Time aggregation

- Up to 45 days: daily buckets.
- 46–180 days: weekly buckets beginning Monday.
- More than 180 days: monthly buckets.
- All labels use Asia/Manila business dates.

## Controls and reconciliation

1. Access is Super Admin only through both the UI and API.
2. The API rejects invalid or reversed ranges and caps queries at five years.
3. Production test data must be explicitly tagged; names and email patterns are never used as hidden heuristics.
4. Gross Sales must reconcile to Net Sales plus Refunds.
5. Inactive Organizers must reconcile to Total Organizers minus Active Organizers.
6. The calculation contract version must change before any definition changes.
7. CSV export is Super Admin only, neutralizes spreadsheet-formula prefixes, and writes an audit record containing the report range and contract version.
8. Organizer-level totals must reconcile to the platform transaction totals for events that have an organization owner.

## Delivery surfaces

- `GET /api/v1/admin/analytics/executive/definitions` — versioned machine-readable metric dictionary.
- `GET /api/v1/admin/analytics/executive` — reconciled dashboard dataset and organizer-performance rows.
- `GET /api/v1/admin/analytics/executive/export` — audited CSV generated from the same calculation snapshot.
- `/admin/executive-analytics` — Super Admin dashboard with a global date range, reconciliation cards, trend chart, demographic coverage, organizer ranking, and CSV export.
