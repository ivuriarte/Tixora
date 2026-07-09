# Database Rulebook — Axon Tickets

**Who reads this:** the `db-architect` agent at the Database gate, and any human designing schema changes.
**Plain-English goal:** no database change may ever destroy customer data or be impossible to undo.

---

## Hard rules (violating any = gate REJECT)

1. **Additive only.** New tables, new nullable/defaulted columns, new indexes — yes. `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, `ALTER ... DROP`, `DELETE FROM` in a migration — no.
2. **Every migration ships with rollback SQL** written in the PR description. If you can't write the rollback, the migration isn't ready.
3. **Money is PHP pesos, stored as integers.** ₱500 ticket → `price = 500`. Never centavos. Never `* 100` / `/ 100` in business logic.
4. **Every new table gets a Row-Level Security (RLS) policy** before it ships. No exceptions without written sign-off in the ledger.
5. **Migrations run on UAT first**, always. Prod migrations run in CI (`migrate-prod` job) before API deploy — never by hand.
6. **No destructive "cleanup" of populated tables** even during rollback. The product-packages tables (referral, demographics) hold captured user data — reverting app code is the rollback, not dropping tables.

## Design rules (violations = findings to fix before approval)

7. **Naming:** enums use `PascalCase` names with `snake_case` values (matches existing: `EventStatus { draft, on_sale }`). Models follow existing schema conventions in `apps/api/prisma/schema.prisma`.
8. **Foreign keys get indexes.** Any column used in a `WHERE` or `JOIN` for a hot path gets an index. Reporting queries get covering indexes (see referral usage: indexed by code + creation time).
9. **Status fields are enums, not strings.** Follow the existing pattern (`OrderStatus`, `RegistrationStatus`, etc.).
10. **Soft delete over hard delete** for anything user-created (pattern: referral codes use soft-delete).
11. **Uniqueness constraints encode business rules** — e.g., referral codes unique per event, one usage record per registration. If the business rule says "only one," the database must enforce it, not just the application.
12. **Concurrency-sensitive writes use advisory locks or transactions** — follow the referral redemption pattern (transaction-scoped PostgreSQL advisory lock per event+code).

## Process

- Schema design is reviewed at the gate **before** `prisma migrate dev` generates the migration.
- Connection strings: pooled `DATABASE_URL` for the app, `DIRECT_URL` for migrations (PgBouncer can't run migrations).
- Neon/Supabase serverless = limited connections. New queries must not open unbounded parallel connections.

## What the reviewer checks, in order

1. Is every operation additive?
2. Is rollback SQL present and correct?
3. Do new tables have RLS planned?
4. Are money columns integer pesos?
5. Are enums/naming consistent with the existing schema?
6. Are indexes present for FKs and query paths?
7. Do unique constraints enforce the stated business rules?
8. Any concurrent-write risk without a lock/transaction?
