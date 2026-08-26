# Optional Inclusions Release Scope Gate

This release may contain only the Optional Inclusions v1 implementation, its database migration, shared contracts, tests, and documentation.

## Canonical base

- Base branch: `origin/main`
- Base SHA at implementation start: `5ba1526a15b889503385c297e929036cf0ff37a2`
- Canonical feature branch: `codex/optional-inclusions`

The base SHA must be refreshed and the feature rebased or rebuilt if `origin/main` advances before production promotion.

## Expected change families

- Optional-inclusion Prisma models and one additive migration
- Optional-inclusion Nest module, DTOs, services, lifecycle integration, and tests
- Registration line-item, quote, inventory, proof, cancellation, scheduler, reporting, and email integration required by the feature
- Shared optional-inclusion and registration contracts
- Organizer catalog, inventory, fulfillment, and report interfaces
- Customer event, registration, payment, account, and ticket presentation required by the feature
- Event-level and global feature-flag configuration
- Optional-inclusion Playwright fixtures and scenarios
- This implementation contract and release evidence

## Forbidden in the production candidate

- A merge commit from `uat`
- UAT running-event or merchandise features
- Executive Analytics v2.1 module promotion
- Discovery, organizer-profile, featured-carousel, or icebreaker feature promotion
- Sponsor or workspace feature changes
- Unrelated `.github/workflows` changes
- Playwright reports, screenshots, videos, traces, coverage files, generated PDFs, or local QA artifacts
- Environment inspection files or secrets
- Changes copied from the dirty shared checkout

## Required candidate evidence

Record all of the following before UAT and again before PROD:

```text
base SHA:
candidate SHA:
commits in base..candidate:
name-status diff:
diff stat:
migration list:
Prisma generation result:
API tests/typecheck/build:
Web typecheck/build:
Playwright result:
reviewer/sign-off:
```

For PROD, construct the candidate from a fresh `origin/main` and cherry-pick only the reviewed canonical feature commits. Never promote the UAT compatibility commit.
