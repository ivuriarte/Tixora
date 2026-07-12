# DevOps & Release Rulebook — Axon Tickets

**Who reads this:** the `devops-reviewer` agent at the Release gate.
**Plain-English goal:** deploys never surprise anyone, the test site stays invisible to the world, and there is always a way back.

---

## Environments (the source of truth)

| Env | Branch | Web | API | Crawlers |
|---|---|---|---|---|
| Dev | feature branches | localhost:3000 | localhost:3001 | n/a |
| UAT | `uat` | uat.axontickets.online | api-uat.axontickets.online | **blocked — all of them** |
| Prod | `main` | axontickets.online | api.axontickets.online | allowed (see seo-standards) |

## Hard rules (violating any = gate REJECT)

1. **Migrations run before API deploy** — the CI order (`migrate-prod` → `deploy-api`) is load-bearing. New code must never hit an old schema. Never reorder these jobs.
2. **UAT must be invisible to search engines and AI crawlers.** `noindex` + robots disallow-all + AI bots (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot) blocked. Synthetic test events leaking into Google or ChatGPT answers is a production incident.
3. **Secrets live in GitHub Actions secrets and Vercel env vars only.** Never inline in workflow files, never committed. A secret pasted in a workflow = REJECT + rotate the secret.
4. **Prod merges require the release-process gates:** CI green + UAT sign-off recorded (SHA, tester, date). `main` and `uat` keep force-push protection.
5. **Every workflow change is reviewed at this gate.** A broken `ci.yml` can deploy untested code or skip migrations — pipeline files are production code.
6. **Rollback is always coordinated:** Vercel "promote previous deployment" for code + documented rollback SQL for schema — never one without the other. Destructive rollback of populated tables is forbidden (see db-standards).

## Design rules (findings to fix before approval)

7. **Post-deploy verification:** after a UAT deploy, smoke checks run (health endpoint 200, homepage renders, login flow works) before any prod promotion. The e2e smoke job (Playwright, public flows) stays green on `main`.
8. **Failure alerts:** deploy and migration failures notify Slack (existing `rtCamp/action-slack-notify` pattern). New critical jobs get the same failure hook.
9. **Env var changes ship complete:** new var → added in Vercel (all environments it applies to) + `.env.example` + `docs/environment-matrix.md`, in the same PR.
10. **DB backups:** the `db-backup.yml` workflow stays scheduled; before any risky migration, take a manual `pg_dump`.
11. **Least privilege:** tokens used by CI (Vercel, GitHub) are scoped; no personal tokens pasted into workflows.
12. **Load tests never point at prod write endpoints** (see `load-tests/README.md`) — staging/UAT only, with rate-limit raise + revert.

## What the reviewer checks, in order

1. Migration-before-deploy ordering intact?
2. UAT noindex + robots + AI-bot blocking intact (and prod NOT blocked)?
3. Any secret in a workflow file or log output?
4. Branch protection / release gates respected?
5. Smoke checks still run and pass after deploy?
6. Failure notifications wired for new jobs?
7. Env vars added everywhere they're needed?
8. Rollback path documented for this release?
