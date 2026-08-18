# Isolated UAT enhancement release — workspace ownership, due dates, and sponsors

Date: 19 August 2026 (Asia/Manila)

## Isolation contract

- Branch: `codex/uat-isolated-workspace-sponsors`
- Pinned base: production `origin/main` commit `6624be8d55290fc673dee89c5d060650b188f1a7`
- The branch was created in a separate worktree. It does not contain the unrelated dirty state or the latest `origin/uat` commits.
- Database changes are additive. Existing workspace tasks remain; only newly enabled workspaces start empty.

## Delivered scope

- Sponsor cards render immediately in full color under the registration/ticket panel and use the same colored-logo treatment in event preview.
- Workspace categories are first-class records and can be created, renamed, or deleted with their tasks.
- Tasks can be created and deleted within a category, assigned to verified Responsible and Accountable organization members, and given a due date.
- Due states use Asia/Manila calendar days: overdue, due today, due soon (1–3 days), upcoming, unscheduled, and completed.
- Organizer owners/admins can add members, change roles, and remove members. Pending accounts become assignable only after email verification. Removing a member safely unassigns affected tasks.
- Daily reminder digests are sent to the current verified email of linked Responsible/Accountable users. Duplicate delivery is prevented per task, recipient, date, and state; failed SMTP attempts are not marked sent.
- Event edit readiness, internal reports, preview, workspace summaries, and overdue endpoints adapt to the relational ownership/due-state model. External reports remain email-free.

## Pre-deployment verification

- Prisma schema format and validation: passed.
- API typecheck and lint: passed.
- Web typecheck and lint: passed (two pre-existing `no-img-element` warnings outside this scope).
- API unit portfolio: 16 suites, 147 tests passed.
- Focused workspace/organization/scheduler portfolio: 3 suites, 53 tests passed.
- API production build: passed.
- Web UAT production build: passed, 42 static pages generated.
- `git diff --check`: passed.

## Inherited baseline note

`npm audit --omit=dev` reports 22 inherited production dependency advisories (9 high, 12 moderate, 1 low) on the pinned production baseline. Resolving them requires framework-level upgrades and is intentionally excluded from this isolated feature branch to avoid mixing unrelated release risk.

## Deployment evidence

- UAT database migration `20260819090000_isolated_workspace_ownership_and_categories` applied successfully to the validated UAT database only. Production database credentials were not used.
- Migration/backfill check: 15 categories, 50 preserved tasks, 0 uncategorized tasks, and 50 tasks intentionally left without due dates for organizer completion.
- API deployment `dpl_E4djPkrqmHkWGJuTWaC5974FFX7J` is Ready in Vercel target `uat` and aliased to `https://api-uat.axontickets.online`.
- Web deployment `dpl_GUXjxu7JFjsKVJmz3d66tmb4FDyQ` is Ready in Vercel target `uat` and aliased to `https://uat.axontickets.online`.
- Public event smoke test returned HTTP 200 through the authenticated Vercel deployment path. Visual verification confirms the colored Sponsors & Partners card appears directly below Reserve Tickets.
- API smoke tests: health HTTP 200 with UAT environment/database/Redis healthy; public events HTTP 200; anonymous team-members HTTP 401; unsigned reminder endpoint HTTP 401.
- Vercel cron jobs are production-deployment-only, so the custom `uat` target cannot register one directly. A dedicated `tixora-uat-scheduler` project was deployed solely to call the protected UAT API; it contains no application or database logic and does not contact PROD.
- Scheduler deployment `dpl_3Nn7UmN24kPujNvByqULfhrfHRhv` registered `/api/workspace-due-reminders` at `0 0 * * *` (08:00 Asia/Manila). Anonymous access returns HTTP 401.
- Before the live scheduler smoke test, a read-only UAT query confirmed 0 actionable reminder tasks and 0 verified recipients. The protected invocation then returned HTTP 200, so no user email was sent during testing.
- The UAT-only cron credential was rotated after route tracing, and request logging now redacts both Authorization and `x-cron-secret` values.

## Verification boundary

- Application-side recipient selection, due-state calculation, digest consolidation, idempotency, and failed-SMTP behavior are covered by automated tests.
- No claim is made that a real email reached a controlled mailbox in this release run: UAT had no actionable assigned tasks, and sending an artificial message to a real member was intentionally avoided.
- Authenticated organizer interaction remains available for stakeholder acceptance at `https://uat.axontickets.online`; automated verification did not use or expose repository-held UAT credentials.
