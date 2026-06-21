# Release Process — Axon Tickets

**Updated:** June 21, 2026

---

## Environment Overview

| Environment | Branch | Web | API | Data |
|---|---|---|---|---|
| **Development** | Feature branches | `localhost:3000` | `localhost:3001` | Local / dev DB |
| **Preview** | Any PR branch | Vercel-generated URL | Vercel-generated URL | UAT database (integration tests only) |
| **UAT** | `uat` | `https://uat.axontickets.online` | `https://api-uat.axontickets.online` | Synthetic test data only |
| **Production** | `main` | `https://axontickets.online` | `https://api.axontickets.online` | Real attendees and payments |

---

## Release Path

```
Feature branch
    │
    │  git push + open PR targeting `uat`
    ▼
PR Preview (Vercel)
    │  • CI must pass: lint, type-check, unit tests, build
    │  • Code review (at least 1 approval)
    ▼
Merge to `uat`
    │  • Vercel auto-deploys to uat.axontickets.online
    │  • Prisma migrations run against UAT database
    │  • Smoke tests run automatically
    ▼
UAT Acceptance
    │  • Stakeholder tests against uat.axontickets.online
    │  • All UAT-01 through UAT-10 scenarios pass
    │  • Sign-off record filed (build SHA, tester, date, outcome)
    ▼
Merge to `main`  ← requires recorded UAT sign-off
    │  • Vercel auto-deploys to axontickets.online
    │  • Prisma migrations run against production database
    ▼
Production
```

---

## Rules

### Branch protection
- **`main`** — requires CI pass + 1 review. Force pushes blocked.
- **`uat`** — requires CI pass. Force pushes blocked.
- Neither branch may be merged without a green build.

### Who can merge where
| Target | Who |
|---|---|
| `uat` | Any team member, after PR review |
| `main` | Platform owner only, after UAT sign-off |

### Hotfix path (urgent production bug)
```
hotfix/<name> branch (from main)
    → PR targeting main
    → Expedited review + CI
    → Merge to main
    → Cherry-pick to uat to keep branches in sync
```

---

## Pre-merge checklist (for every PR)

- [ ] `npm run lint` passes in the affected app
- [ ] `npm run type-check` passes
- [ ] Unit tests pass (`npm test`)
- [ ] No new `process.env.NODE_ENV` checks — use `APP_ENV` instead
- [ ] No secrets committed
- [ ] `.env.example` updated if new env vars were added
- [ ] `docs/environment-matrix.md` updated if new env vars were added

## Pre-production checklist (before merging `uat` → `main`)

- [ ] UAT sign-off record filed with: build SHA, tester name, date, scenarios tested, known issues, decision
- [ ] No open P0 bugs from UAT testing
- [ ] Database migration is backwards-compatible (or downtime window is agreed)
- [ ] Event-day pre-flight checklist reviewed if near an event date

---

## Rollback

### Code rollback
Use the Vercel dashboard → Deployments → select a previous deployment → **Promote to Production**.
This does NOT undo database migrations.

### Database rollback
Prisma does not auto-generate down migrations. Before any destructive migration:
1. Take a manual `pg_dump` backup of the production database.
2. Document the rollback SQL in the PR.
3. If rollback is needed: restore from the backup or apply the rollback SQL manually.

> A Vercel code rollback and a Supabase database restore must be coordinated — never roll back one without the other.
