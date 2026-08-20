# Isolated UAT Release — Organizer Roles, My Tasks, and Stakeholder Report

Date: 2026-08-20

Branch: `codex/org-roles-my-tasks`

Baseline: `1d67e261c17392c6a5dc0bc6a5c81858191d63a5`

## Release boundary

This release is an isolated delta from the baseline above. UAT and any later production promotion must use only the commits created on this branch for the capabilities listed below. Do not merge or promote the UAT branch as a whole, and do not include unrelated UAT commits.

## Included capabilities

- Workspace tasks display the complete title and description, with an explicit full-task editor for title, description, notes, RACI assignments, due date, priority, blocker flag, and status.
- Workspace task rows use stable columns for Responsible, Accountable, Due Date, due-state, Status, and actions. The due-state badge is aligned beside its date.
- Organizer teams support Owner, Co-owner, Manager, and Member roles. Unknown or unverified emails remain pending invitations until the recipient verifies the same Axon account email.
- The account creator remains the immutable Owner in this release. Only the Owner or a platform administrator can mutate events, ticket configuration, referral configuration, and event artwork. Other organizer roles receive view-only event access.
- Co-owners and Managers can structure and operate the Workspace. Members can view the Workspace and update only tasks assigned to them as Responsible or Accountable.
- My Tasks appears beside Workspace for every authorized event. It shows only the signed-in user's Responsible and Accountable assignments, prioritizes overdue and near-due work, supports status and progress-note updates, and opens assignment-email links on the exact highlighted task.
- Removing a team member clears their Workspace role snapshots and both Responsible and Accountable task assignments so reminder emails stop immediately.
- The stakeholder progress report is a share-safe, paginated executive brief with a narrative readiness interpretation, decision-oriented KPIs, workstream progress, priority actions, milestones, full wrapped titles, and page footers.

## Permission matrix

| Capability | Owner | Co-owner | Manager | Member |
| --- | --- | --- | --- | --- |
| View organizer events | Yes | Yes | Yes | Yes |
| Create, edit, or delete events and event configuration | Yes | No | No | No |
| Manage organization profile and members | Yes | Yes, except Co-owner control | No | No |
| Create, edit, or delete Workspace categories/tasks/milestones | Yes | Yes | Yes | No |
| View event Workspace and reports | Yes | Yes | Yes | Yes |
| Update an assigned task from My Tasks | Yes | Yes | Yes | Yes |
| Appoint or remove a Co-owner | Yes | No | No | No |

## Notification behavior

- Assignment email: sent immediately to a verified member newly assigned as Responsible or Accountable.
- Due digest: sent daily at 08:00 Asia/Manila to each verified Responsible or Accountable member with active tasks that are overdue, due today, or due within the next three Manila calendar dates.
- Recipient deduplication: a person assigned as both Responsible and Accountable receives one digest row per task.
- Delivery idempotency: a recipient/task/due-state combination is recorded after a successful send so the same reminder is not resent on the same day.
- Exclusions: completed tasks, not-applicable tasks, closed workspaces, cancelled/completed events, unverified accounts, unassigned users, and failed/revoked/expired invitations.

## Verification evidence

- Prisma schema validation: passed.
- API type check and lint: passed.
- Web type check and lint: passed; two pre-existing `next/image` advisory warnings remain outside this release.
- API unit/regression suite: 19 suites, 163 tests passed.
- API production build: passed.
- Web production build: passed; 42 routes generated, including `/admin/events/[id]/my-tasks`.
- Stakeholder PDF QA: generated from an automated long-content fixture and visually inspected across all three pages for wrapping, hierarchy, pagination, and footer integrity.

## Promotion gate

Before UAT deployment, record the exact release-head commit and deploy that revision. Before production promotion, verify that the production diff from the baseline contains only this release's committed files and migration, and that the production candidate tree matches the UAT-tested release head. A general UAT-to-production merge is prohibited for this release.

## Database safety and rollback

- The migration is additive: it retains the legacy `admin` enum value, adds `co_owner` and `manager`, and normalizes legacy `admin` values to Manager at the application boundary. It does not rewrite or delete existing memberships.
- Both new tables enable Row-Level Security and grant direct access only to Supabase's `service_role`; the API's table-owner connection continues to enforce application authorization.
- Safe rollback SQL is intentionally non-destructive: `BEGIN; COMMIT;`. If application rollback is required, promote the previous API/web deployment and leave the additive enum values, nullable description column, invitations, and task-update records in place.
- Before PROD migration, confirm a current production `pg_dump`/Supabase backup. A schema restore is reserved for migration failure; do not drop populated tables during an application rollback.
