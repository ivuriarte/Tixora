# Axon Event Readiness MVP - Claude Code Handoff Pack

This document is a non-code implementation handoff for the MVP defined in:

- `docs/event-workspace-readiness-center-product-package.md`

It is designed so you can copy-paste prompts into Claude Code in sequence.

## July 2026 Implemented Baseline

Do not rebuild the following capabilities when continuing this handoff:

- Event-scoped referral codes with percentage/fixed discounts, dates, tier restrictions, maximum usage, activation controls, aggregate dashboard data, and CSV export.
- Server-authoritative referral pricing with transaction-level protection against concurrent over-redemption.
- Required birthday, gender, and city fields across onboarding, profiles, registrations, pending-attendee edits, and authorized exports.
- Sponsor presentation metadata including tier, description, HTTPS website, visibility, and safe JPG/PNG/WebP logo upload.
- Ordered flexible event sections with optional image, required image alt text, visibility, and public rendering.
- Corrected post-event `completed` status gate.
- Event Workspace authorization hardening, real organization-member assignment, workspace closure snapshot, and expanded audit coverage.

Migration dependency: `20260704180000_add_product_packages_mvp` must be applied before the July product-package application code is exercised. Sponsor CRM/contact records remain explicitly out of scope. Demographic reports must remain aggregate-only with small-cohort suppression.

## 1. MVP Build Layout

The MVP should be built in this order so dependencies are handled cleanly and the product stays inside scope.

### Phase 0 - Guardrails, Discovery, and Architecture Alignment

Things that need to be done:

1. Inspect the current Axon codebase and identify:
   - existing event creation flow
   - user/org/account model
   - role/permission model
   - current reporting modules
   - current ticketing, registration, attendance, and check-in data sources
   - current audit/logging patterns
2. Confirm where the MVP should live in the existing product:
   - admin area
   - organizer area
   - event detail pages
   - reporting/export module
3. Define the minimum new domain objects needed for MVP only.
4. Confirm all out-of-scope items stay excluded:
   - sponsor CRM/contact storage
   - volunteer management
   - advanced dependency graph
   - full risk register
   - workflow automation
   - AI recommendations
   - benchmarking
   - budgeting
   - portfolio dashboards
5. Confirm the UX principle:
   - simpler than Excel
   - low clutter
   - fast repeated updates
   - high information density without confusion

### Phase 1 - Foundation and Data Model

Things that need to be done:

1. Add or extend organizer organization model if needed.
2. Add organizer approval status and admin review flow.
3. Define Event Workspace model linked one-to-one or one-to-event.
4. Define readiness checklist template structure.
5. Define readiness checklist items with:
   - category
   - title
   - description if needed
   - status
   - blocked flag
   - criticality/weight
   - due date
   - owner
   - accountable lead
   - optional consulted/informed fields
   - audit timestamps
6. Define stakeholder report/export permissions.
7. Define report generation structures for MVP post-event suite.
8. Define privacy-safe reporting rules:
   - no attendee names
   - no emails
   - no phone numbers
   - no exact addresses
   - no sponsor contacts
   - suppress or group tiny demographic cohorts

### Phase 2 - Organizer Management

Things that need to be done:

1. Organizer registration flow
2. Organization profile capture
3. Admin approval/rejection workflow
4. Access restriction so only approved organizers can create or operate events

### Phase 3 - Event Workspace

Things that need to be done:

1. Auto-create Event Workspace when an event is created
2. Allow readiness enablement for existing eligible events with no workspace
3. Add event workspace navigation
4. Build event overview dashboard with:
   - readiness score
   - open items
   - blocked items
   - milestones
   - read-only behavior for non-edit users

### Phase 4 - Event Readiness Center

Things that need to be done:

1. Apply checklist templates to new workspaces
2. Render grouped categories clearly
3. Support checklist statuses:
   - Not Started
   - In Progress
   - Blocked
   - Done
   - Not Applicable
4. Support blocker tracking and blocked item surfacing
5. Implement weighted readiness scoring
6. Implement critical blocker override to force Blocked state
7. Refresh score and summaries when readiness items change

### Phase 5 - Task Ownership and Accountability

Things that need to be done:

1. Assign owner and due date to checklist items
2. Flag unowned items
3. Show overdue and upcoming work
4. Add lightweight RACI support
5. Group or summarize ownership clearly for managers and owners

Note:
- `TR-01` is MVP Must Have
- `TR-02` lightweight RACI is MVP Should Have

### Phase 6 - Stakeholder Reporting

Things that need to be done:

1. Generate downloadable stakeholder progress report
2. Include:
   - event summary
   - readiness score
   - category progress
   - blockers summary
   - milestones
3. Ensure report is share-safe
4. Exclude:
   - attendee PII
   - sponsor contact records
   - internal notes
   - editable controls
5. Keep live stakeholder view out of MVP unless effortless and strictly read-only

Note:
- `SD-01` is MVP Must Have
- `SD-02` is MVP Could Have and should be deferred unless the first release is still small and stable

### Phase 7 - Post-Event Report Suite

Things that need to be done:

1. Trigger report suite only for completed events
2. Generate:
   - Executive Summary Report
   - Sales and Revenue Report
   - Registration Report
   - Attendance and Check-In Report
   - Operations and Blockers Report
   - Demographics Report
   - Privacy-Safe External Export
3. Pull data from existing Axon sources where possible
4. Keep all reporting aggregated and share-safe
5. Do not expose attendee-level personal records
6. Do not expose sponsor contact records or relationship notes

### Phase 8 - Admin, Audit, and Governance

Things that need to be done:

1. Record organizer approval actions
2. Record readiness item changes
3. Record ownership and due date changes
4. Record report generation actions if appropriate
5. Ensure platform support/admin visibility is limited and appropriate

### Phase 9 - QA, UAT, and MVP Readiness

Things that need to be done:

1. Test complete organizer journey
2. Test event creation to workspace creation
3. Test checklist application and updates
4. Test scoring behavior
5. Test blocked-state override
6. Test stakeholder report generation
7. Test post-event report suite generation
8. Test privacy rules on exports
9. Validate UI simplicity and clutter reduction
10. Confirm pilot organizer can manage at least one event without returning to a spreadsheet

## 2. MVP Delivery Sequence

Use this order for actual implementation:

1. Codebase audit and implementation plan
2. Data model and permissions foundation
3. Organizer registration and approval
4. Event Workspace creation and navigation
5. Event overview dashboard
6. Checklist templates
7. Checklist status and blockers
8. Readiness score
9. Owner and due date assignment
10. Lightweight RACI
11. Downloadable stakeholder progress report
12. Post-event report suite
13. Privacy-safe external export
14. Audit and governance hardening
15. QA and UAT pass

## 3. MVP Definition of Done

The MVP is done only when all of the following are true:

1. An organizer can register and be approved.
2. An approved organizer can create an event.
3. Event creation creates or enables an Event Workspace.
4. A readiness checklist template can be applied.
5. Readiness items can be assigned owners, due dates, statuses, and blocked flags.
6. Readiness score is calculated using applicable weighted items.
7. Critical blockers override the score with a blocked status.
8. Event Owner and Manager can review readiness, blockers, and milestones.
9. Organizers can generate a share-safe stakeholder progress report without exposing sensitive internal data.
10. Axon can generate a post-event report suite with executive summary, sales, registration, attendance, blockers, and demographic graphs without exposing attendee-level personal data.

## 4. Copy-Paste Master Prompt For Claude Code

Use this first before the feature prompts.

```text
You are implementing the Axon Tickets Event Workspace & Event Readiness Center MVP inside the existing codebase.

Important product rules:
- Follow the existing codebase patterns, architecture, naming, and UI conventions.
- Do not invent a parallel system if the codebase already has a suitable pattern.
- Keep the UI simple, low-clutter, and easier to use than a spreadsheet.
- The MVP is event-centric, not a generic project management tool.
- Do not build anything outside MVP scope unless explicitly required by a dependency.

Out of scope:
- Sponsor CRM/contact storage
- Volunteer management
- Advanced dependency graph
- Full risk register
- Workflow automation
- AI recommendations
- Benchmarking
- Budgeting
- Portfolio dashboards

Critical privacy rules:
- Never expose attendee-level personal data in stakeholder-facing or external report outputs.
- Exclude names, emails, phone numbers, exact addresses, and other identifying attendee fields from share-safe outputs.
- Exclude sponsor contact records and relationship notes.
- If a demographic group is too small, group or suppress it to reduce re-identification risk.

MVP epics:
1. Organizer Management
2. Event Workspace
3. Event Readiness Center
4. Task Ownership & RACI
5. Stakeholder Reporting
6. Post-Event Report Suite

Before implementing any task:
1. Inspect the relevant parts of the current codebase.
2. State the exact files/modules you will change.
3. Reuse existing models, service patterns, UI primitives, auth rules, and reporting mechanisms where possible.
4. Keep the implementation narrow and production-safe.
5. Add or update tests proportional to risk.

For each task:
- summarize the existing implementation relevant to the task
- implement the feature
- explain key decisions briefly
- run relevant tests or validation steps
- report any assumptions or blockers clearly
```

## 5. Feature Prompts For Claude Code

These are ordered for implementation.

### Prompt 1 - MVP Architecture and Gap Analysis

```text
Using the existing Axon Tickets codebase, perform an MVP implementation audit for the Event Workspace & Event Readiness Center initiative.

Goal:
Produce a concrete implementation plan for the MVP without coding blindly.

Scope:
- Organizer Management
- Event Workspace
- Event Readiness Center
- Task Ownership & RACI
- Stakeholder Reporting
- Post-Event Report Suite

What to do:
1. Inspect the current codebase and identify the existing modules for:
   - auth/user accounts
   - organizer or tenant structures
   - event creation
   - event detail pages
   - reporting
   - registration
   - ticketing
   - attendance/check-in
   - roles/permissions
   - audit logging
2. Map what can be reused versus what must be added.
3. Propose the minimum set of new models, services, routes, UI screens, and background/reporting jobs needed for the MVP.
4. Identify any risky coupling or migration concerns.
5. Recommend the best implementation order aligned with dependency flow.

Constraints:
- Stay within MVP scope only.
- Do not include sponsor CRM/contact storage.
- Do not include volunteer management or advanced dependencies.
- Keep the product event-specific and simpler than Excel.

Required output:
- current-state summary
- proposed MVP architecture additions
- feature-by-feature dependency order
- risk list
- recommended first implementation ticket
```

### Prompt 2 - Organizer Registration

```text
Implement MVP story OM-01: Organizer Registration.

User story:
As a new organizer, I want to register my organization, so that I can manage events under a verified business profile.

Business value:
Creates a trusted SaaS onboarding path and supports tenant ownership.

Acceptance criteria:
- Given a new organizer has valid contact and organization information, when they submit registration, then an organizer profile is created with pending approval status.
- Given required fields are missing, when the organizer submits the form, then the system prevents submission and identifies missing fields.
- Given registration is submitted, when a platform admin views pending organizers, then the organizer appears in the approval queue.

Implementation instructions:
1. Inspect existing user/auth/account creation patterns first.
2. Reuse existing form, validation, persistence, and admin list patterns where possible.
3. Create only the minimum organization profile fields required for the MVP.
4. Store organizer registration in a pending approval state by default.
5. Keep the UX clean and non-intimidating.

Out of scope:
- billing
- advanced KYC
- sponsor data
- complex onboarding workflows

Definition of done:
- organizer registration works end to end
- validation is clear
- pending organizers are visible to admins
- tests or validation cover happy path and failure cases
```

### Prompt 3 - Organizer Approval Workflow

```text
Implement MVP story OM-02: Organizer Approval.

User story:
As a platform admin, I want to approve or reject organizer applications, so that Axon controls who can operate events on the platform.

Business value:
Reduces fraud, protects platform quality, and supports governance.

Acceptance criteria:
- Given an organizer is pending approval, when an admin approves them, then the organizer can create events.
- Given an organizer is rejected, when they attempt to create an event, then access is denied with a clear status message.
- Given an approval decision is made, when the record is viewed later, then the decision, actor, and timestamp are visible to authorized admins.

Implementation instructions:
1. Reuse existing admin authorization and moderation patterns if they exist.
2. Add approval state transitions cleanly.
3. Prevent unapproved organizers from creating events.
4. Record actor and timestamp for governance/audit.
5. Keep admin screens practical and low-friction.

Out of scope:
- automated approval scoring
- document verification workflows
- email automation unless already present and trivial

Definition of done:
- admins can approve/reject
- approval state gates event creation
- governance metadata is retained
- tests cover approval, rejection, and access restrictions
```

### Prompt 4 - Auto-Create Event Workspace

```text
Implement MVP story EW-01: Auto-Create Event Workspace.

User story:
As an Event Owner, I want an Event Workspace to be created when I create an event, so that operational planning starts immediately.

Business value:
Makes readiness a default part of event operations instead of a separate setup step.

Acceptance criteria:
- Given an approved organizer creates an event, when the event is saved, then an Event Workspace is automatically created.
- Given a workspace is created, when the Event Owner opens the event, then workspace navigation is available.
- Given an existing event has no workspace, when an authorized owner enables readiness, then a workspace is created for that event.

Implementation instructions:
1. Inspect the existing event creation flow first.
2. Add Event Workspace creation in the least invasive way.
3. Support both new events and existing eligible events without a workspace.
4. Keep workspace creation idempotent so duplicates cannot occur.
5. Add navigation in the event area using existing patterns.

Out of scope:
- complex workspace templates beyond readiness
- project-management features unrelated to events

Definition of done:
- workspace is created reliably
- navigation appears correctly
- existing eligible events can be enabled safely
- tests cover duplicate protection and event linkage
```

### Prompt 5 - Event Overview Dashboard

```text
Implement MVP story EW-02: Event Overview Dashboard.

User story:
As an Event Manager, I want to see the event's readiness summary, so that I know what needs attention first.

Business value:
Reduces time spent reconciling scattered tools and improves operational focus.

Acceptance criteria:
- Given readiness items exist, when the dashboard loads, then it shows readiness score, open items, blocked items, and upcoming milestones.
- Given there are critical blockers, when the dashboard loads, then the blocked status is visually prominent.
- Given a user lacks edit access, when they view the dashboard, then they can see permitted information without edit controls.

Implementation instructions:
1. Keep the screen visually simple and high-signal.
2. Optimize for scanning, not decoration.
3. Reuse existing dashboard widgets/components if appropriate.
4. Respect read-only versus editable roles.
5. Surface the most important operational indicators first.

Out of scope:
- generic kanban boards
- dense analytics dashboards
- cross-event executive views

Definition of done:
- dashboard is usable and uncluttered
- role-based behavior is correct
- readiness summary is accurate
- blocked state is clearly visible
```

### Prompt 6 - Checklist Templates

```text
Implement MVP story RC-01: Apply Checklist Template.

User story:
As an Event Manager, I want to apply a readiness checklist template, so that I do not start operational planning from scratch.

Business value:
Drives adoption by replacing the organizer's spreadsheet with an immediate useful structure.

Acceptance criteria:
- Given a new workspace exists, when the template is applied, then readiness categories and checklist items are created.
- Given an item does not apply, when it is marked Not Applicable, then it is excluded from readiness scoring.
- Given a template is applied, when the readiness center opens, then categories are grouped and easy to scan.

Implementation instructions:
1. Define the minimum template structure for the MVP.
2. Use practical default categories from the product package.
3. Support Not Applicable cleanly in the data model and UI.
4. Keep the readiness center easy to scan and update.
5. Avoid over-building a template management system.

Out of scope:
- custom template builder
- advanced template versioning
- organization-specific workflow engines

Definition of done:
- a workspace can be initialized from a default checklist template
- categories are grouped clearly
- Not Applicable behavior works correctly
```

### Prompt 7 - Checklist Status and Blockers

```text
Implement MVP story RC-02: Track Checklist Status And Blockers.

User story:
As an Operations Lead, I want to update item status and mark blockers, so that readiness reflects operational reality.

Business value:
Makes risks visible before event day.

Acceptance criteria:
- Given an item is assigned to me, when I change its status, then the readiness center reflects the new status.
- Given an item is blocked, when I mark it blocked, then it appears in the blocked items list.
- Given a blocked item exists, when readiness is summarized, then the dashboard highlights the blocker count.

Implementation instructions:
1. Support these statuses: Not Started, In Progress, Blocked, Done, Not Applicable.
2. Make status updates quick and low-friction.
3. Surface blockers prominently in both readiness center and summary views.
4. Reuse existing mutation/update patterns and authorization checks.

Out of scope:
- full dependency graph
- full risk register
- escalation automation

Definition of done:
- statuses update correctly
- blockers are clearly surfaced
- summary views reflect reality immediately or predictably
```

### Prompt 8 - Readiness Score

```text
Implement MVP story RC-03: Readiness Score.

User story:
As an Event Owner, I want a readiness score, so that I can quickly judge whether the event is on track.

Business value:
Creates an executive-friendly signal and a differentiator from generic spreadsheets.

Acceptance criteria:
- Given applicable checklist items have statuses and weights, when readiness is calculated, then the score reflects completed weighted points divided by applicable weighted points.
- Given a critical item is blocked, when the score is displayed, then the event shows Blocked even if the numeric score is high.
- Given items are updated, when the dashboard is refreshed, then the readiness score updates accordingly.

Implementation instructions:
1. Use the MVP scoring model from the package.
2. Exclude Not Applicable items from denominator.
3. Treat blocked critical items as a blocked override.
4. Show both numeric score and status label where useful.
5. Keep the explanation transparent enough that organizers trust it.

Out of scope:
- predictive scoring
- AI recommendations
- benchmarking against other events

Definition of done:
- score math is correct
- blocked override works
- UI communicates score and status clearly
- tests cover edge cases
```

### Prompt 9 - Ownership and Due Dates

```text
Implement MVP story TR-01: Assign Ownership And Due Dates.

User story:
As an Event Manager, I want to assign owners and due dates to readiness items, so that every item has accountable follow-through.

Business value:
Converts checklists from passive lists into accountable execution tools.

Acceptance criteria:
- Given a checklist item exists, when an authorized user assigns an owner and due date, then both appear on the item.
- Given an item has no owner, when readiness is reviewed, then it is flagged as unowned.
- Given an item is overdue, when the dashboard loads, then it appears in upcoming or overdue work.

Implementation instructions:
1. Reuse existing team/member selection patterns.
2. Keep assignment and due-date updates fast.
3. Flag unowned and overdue work in a manager-friendly way.
4. Respect role permissions cleanly.

Out of scope:
- complex dependency scheduling
- multi-level project planning

Definition of done:
- owners and due dates can be assigned and edited
- unowned items are visible
- overdue/upcoming summaries are accurate
```

### Prompt 10 - Lightweight RACI

```text
Implement MVP story TR-02: Lightweight RACI.

User story:
As an Event Owner, I want to identify responsible and accountable people for key items, so that ownership is clear.

Business value:
Reduces ambiguity among organizers, leads, sponsors, and stakeholders.

Acceptance criteria:
- Given a readiness item exists, when RACI is edited, then Responsible and Accountable fields can be assigned.
- Given Consulted or Informed roles are optional, when they are blank, then the item remains valid.
- Given a user views the RACI summary, when items are grouped by owner, then they can see who owns what.

Implementation instructions:
1. Keep this lightweight.
2. Start with Responsible and Accountable as the most important fields.
3. Consulted and Informed should stay optional and low-friction.
4. Use existing member/role structures wherever possible.

Out of scope:
- enterprise workflow engines
- elaborate approval chains

Definition of done:
- RACI fields can be managed on readiness items
- summary views are understandable
- implementation remains simple and maintainable
```

### Prompt 11 - Downloadable Stakeholder Progress Report

```text
Implement MVP story SD-01: Downloadable Stakeholder Progress Report.

User story:
As an Event Owner, I want to generate a share-safe stakeholder progress report, so that I can communicate status without exposing my internal workspace or sensitive data.

Business value:
Supports sponsors, executives, investors, and institutional stakeholders with low manual reporting effort and stronger data control.

Acceptance criteria:
- Given stakeholder reporting is enabled, when an Event Owner generates a progress report, then it includes event summary, readiness score, category progress, blockers summary, and milestones.
- Given a progress report is generated, when it is shared externally, then it contains no attendee PII, sponsor contact records, internal notes, or editable controls.
- Given an organizer prefers manual sharing, when the report is downloaded, then they can send it outside the platform without granting external system access.

Implementation instructions:
1. Build the downloadable share-safe report first.
2. Use existing export/report generation patterns if available.
3. Make the content concise, readable, and executive-safe.
4. Keep sensitive and internal-only data excluded by design, not by hope.

Out of scope:
- sponsor CRM
- rich external collaboration portal
- broad live dashboard access

Definition of done:
- report generates reliably
- content matches MVP requirements
- privacy constraints are enforced
- output is suitable for manual sharing
```

### Prompt 12 - Optional Strictly Read-Only Stakeholder View

```text
Implement MVP story SD-02 only if it can be added cleanly without bloating the MVP.

User story:
As an Event Owner, I want any stakeholder-facing live view to be strictly read-only, so that external audiences can never change operational data.

Business value:
Enables professional visibility while protecting sensitive operational data.

Acceptance criteria:
- Given live stakeholder viewing is disabled, when an external user attempts access, then the dashboard is unavailable.
- Given a stakeholder has approved access, when they open the dashboard, then they only see the assigned event in read-only mode.
- Given access is revoked, when the stakeholder attempts to reload, then access is denied.

Implementation instructions:
1. Only proceed if the codebase already has a safe way to support scoped read-only access.
2. Do not allow editing under any circumstance.
3. Limit visibility to one event only.
4. Reuse existing access-control patterns.

Out of scope:
- commenting
- editing
- cross-event visibility
- stakeholder collaboration tools

Definition of done:
- access is strictly scoped and read-only
- disabled mode is enforced
- revoked access is enforced

If this adds significant complexity, stop and recommend deferring it.
```

### Prompt 13 - Post-Event Report Suite

```text
Implement MVP story PR-01: Generate Post-Event Report Suite.

User story:
As an Event Owner, I want Axon to generate a post-event report suite, so that I can close the event with a professional summary without exporting raw personal data.

Business value:
Delivers a concrete organizer outcome after the event and keeps sensitive data inside the platform.

Acceptance criteria:
- Given an event is completed, when the post-event report suite is generated, then it includes an Executive Summary Report, Sales and Revenue Report, Registration Report, Attendance and Check-In Report, Operations and Blockers Report, and a Demographics Report.
- Given the report suite includes registration history and demographics, when it is rendered, then it uses aggregated summaries and charts rather than attendee-level personal records.
- Given the report suite includes commercial reporting, when it is generated, then it includes ticket sales by tier, registration trends, attendance totals, check-in rates, and blocker summaries.
- Given attendee personal data exists in the platform, when the post-event report suite is generated, then names, emails, phone numbers, exact addresses, and other specific personal data are excluded.
- Given the report suite is shared externally, when a recipient reads it, then they can understand event performance without being able to identify individual registrants.

Required report coverage:
- Executive Summary Report: event outcome, final readiness state, top wins, top issues, closeout summary
- Sales and Revenue Report: sales totals, revenue totals, ticket mix, commercial trend summary
- Registration Report: registration totals, timeline, historical registration trend
- Attendance and Check-In Report: attendance totals, check-in rate, event-day arrival pattern summary
- Operations and Blockers Report: final blockers, unresolved items, delays, incidents, lessons captured
- Demographics Report: aggregated charts only, no attendee-level personal data

Implementation instructions:
1. Reuse current reporting data sources from ticketing, registration, attendance, and readiness modules.
2. Generate a coherent suite, not unrelated fragments.
3. Keep outputs executive-readable and organizer-useful.
4. Build privacy constraints into the report queries and serializers.

Out of scope:
- attendee-level exports
- sponsor contact data
- advanced cross-event analytics

Definition of done:
- suite can be generated for completed events
- all required report sections are present
- privacy rules are enforced
- output is clear enough to share with leadership
```

### Prompt 14 - Privacy-Safe External Export

```text
Implement MVP story PR-02: Privacy-Safe External Report Export.

User story:
As an Event Owner, I want a privacy-safe export version of the post-event report suite, so that I can share outcomes externally without leaking protected or commercially sensitive data.

Business value:
Preserves organizer trust and reduces data leakage risk while still supporting executive and stakeholder reporting.

Acceptance criteria:
- Given an organizer exports the external version of the report suite, when it is generated, then attendee-level personal data is excluded.
- Given sponsor-related reporting appears in the suite, when it is generated, then no sponsor contact records or relationship notes are included.
- Given demographic data appears in the suite, when counts are too small to safely isolate a group, when the export is produced, then the data is grouped or suppressed to reduce re-identification risk.
- Given the external export is produced, when reviewed by an organizer, then it is suitable for manual sending to executives, partners, or stakeholders.

Implementation instructions:
1. Treat privacy-safe export as a distinct output mode with hard rules.
2. Exclude personal data at the data selection layer, not just the UI layer.
3. Add small-group suppression or grouping logic for demographic sections.
4. Ensure sponsor contact records and relationship notes are never included.

Out of scope:
- public report publishing
- editable external report portals

Definition of done:
- external export is reliably privacy-safe
- demographic suppression works
- no sponsor contacts appear
- output is suitable for manual external sharing
```

### Prompt 15 - Audit, Hardening, and Release Readiness

```text
Perform MVP hardening for the Event Workspace & Event Readiness Center initiative after the core features are implemented.

Goal:
Make the MVP production-safe, scoped correctly, and ready for pilot use.

What to do:
1. Review authorization boundaries across organizer, event, stakeholder, and admin roles.
2. Review audit/governance coverage for:
   - organizer approval actions
   - readiness item changes
   - owner/due date changes
   - blocked/unblocked state changes
   - report generation actions if appropriate
3. Review UI complexity and simplify any screens that feel heavier than Excel.
4. Validate stakeholder and external reports for privacy leaks.
5. Validate post-event report suite coverage against the product package.
6. Add or improve tests for high-risk flows.
7. Produce a short pilot-readiness report listing:
   - what is complete
   - what is intentionally deferred
   - known risks
   - recommended follow-ups before pilot rollout

Constraints:
- Do not expand scope.
- Prefer removing complexity over adding it.
- Protect privacy and trust first.

Definition of done:
- high-risk gaps are addressed or clearly documented
- privacy rules are verified
- MVP remains lean and usable
- release-readiness summary is produced
```

## 6. Recommended Prompting Strategy

Do not paste all prompts into Claude Code at once.

Use this rhythm:

1. Paste the master prompt.
2. Paste Prompt 1 to get the codebase-aware implementation plan.
3. Then paste one feature prompt at a time in delivery order.
4. After each completed feature, ask Claude Code to:
   - summarize what changed
   - list affected files
   - list risks
   - confirm whether the next prompt can proceed safely

## 7. Recommended MVP Cut Line

If time pressure increases, the leanest acceptable MVP cut line is:

Must ship:
- OM-01
- OM-02
- EW-01
- EW-02
- RC-01
- RC-02
- RC-03
- TR-01
- SD-01
- PR-01
- PR-02

Defer first if needed:
- TR-02
- SD-02

That cut still preserves the core product thesis:
- organizers can run readiness inside Axon
- stakeholders can receive safe progress reporting
- post-event closeout reporting creates real business value
