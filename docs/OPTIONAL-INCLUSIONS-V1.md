# Optional Inclusions v1

Status: implementation contract

## Purpose

Allow an organizer to offer event-level, optionally paid products or services without changing the meaning of admission tickets or the existing `TicketTierInclusion` records used for descriptive included benefits and printable stubs.

## Language

- **Included benefit**: bundled with admission and stored in `TicketTierInclusion`.
- **Optional inclusion**: separately selected product or service.
- **Variant**: purchasable option of an inclusion, such as a shirt size.
- **Check-in**: validates admission only.
- **Fulfillment**: records that an optional inclusion was handed over or otherwise completed.

## v1 decisions

1. Optional inclusions are event-level products with variants, exact prices, finite stock, ticket-tier eligibility, sale windows, and manual pickup/fulfillment instructions.
2. The server owns all pricing. A persisted, expiring quote is required for any registration containing an optional inclusion.
3. Referral discounts apply to admission only. The event platform fee applies when the final basket has a positive payable amount, including free admission with a paid inclusion.
4. Inventory is reserved transactionally when a registration consumes a quote. Creating a quote alone does not reserve stock.
5. A submitted proof keeps stock reserved during organizer review. A rejected proof enters a finite resubmission grace period; expiry releases the stock. A later retry must obtain a fresh quote and reservation.
6. Admission check-in never fulfills an inclusion. Fulfillment and reversal are explicit, permission-controlled, audited operations.
7. Historical line items are immutable snapshots. Catalog entries with sales are archived, not hard-deleted.
8. Existing events and registrations without optional inclusions keep their current behavior.
9. Running-event merchandise remains separate included race-kit metadata.
10. Executive ticket counts remain admission-only. Inclusion revenue and units are reported separately.

## Deferred from v1

- Post-purchase add-on sales
- Partial refunds
- Onsite add-on sales
- Shipping or carrier integrations
- Inclusion transfers or resale
- Inclusion-specific promotion rules
- Legacy Reservation/Order checkout integration

The onsite flow must state that optional add-ons are unavailable and the API must reject inclusion input on that path.

## Required customer sequence

`Admission -> attendees -> optional add-ons -> server quote -> review -> registration/stock hold -> payment proof -> approval -> separate fulfillment`

The decision to collect payment is based on the quote total, never `Event.isFree`.

## Release isolation

- Canonical implementation branch: created from the latest verified `origin/main`.
- UAT: canonical feature commits plus, only when required, a separately identified UAT compatibility commit.
- PROD: rebuilt from a fresh `origin/main` and only the canonical optional-inclusion commits.
- Never merge the UAT branch into PROD.
- Reject a production candidate containing unrelated UAT modules, workflow changes, QA artifacts, or local files.

## Non-negotiable gates

- Additive migration and Prisma generation pass.
- API and web type checks pass.
- Unit, integration, authorization, and Playwright coverage pass.
- Real PostgreSQL last-unit race and quote-idempotency tests pass.
- Free admission plus a paid inclusion is verified.
- Check-in without fulfillment is verified.
- Inventory counters reconcile with the append-only movement ledger.
- Fresh production backup is verified before applying the migration.
- Exact candidate SHA and `origin/main...candidate` diff are recorded before promotion.
