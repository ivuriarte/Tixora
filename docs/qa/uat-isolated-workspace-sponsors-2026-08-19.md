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

To be completed after UAT database migration, API/web deployment, and post-deployment smoke tests.
