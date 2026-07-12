---
description: Run a quality gate review (design | db | api | frontend | backend | release | seo) and record the sign-off
argument-hint: <phase> <feature-name> — or "status <feature-name>"
---

You are running the Axon Tickets gate workflow. Arguments given: `$ARGUMENTS`

## If the first argument is "status"

Read `docs/signoffs/<feature-name>.md` and report, in plain language, which gates have passed, which are pending, and what the next step is. If the file doesn't exist, say so and offer to start the feature at its first gate. Stop here.

## Otherwise: run a gate

The first argument is the phase; the rest is the feature name (slugify it for filenames).

| Phase | Agent to spawn | Rulebook |
|---|---|---|
| design | design-reviewer | docs/standards/design-standards.md |
| db | db-architect | docs/standards/db-standards.md |
| api | api-architect | docs/standards/api-standards.md |
| frontend | frontend-reviewer | docs/standards/frontend-standards.md |
| backend | backend-reviewer | docs/standards/backend-standards.md |
| release | devops-reviewer | docs/standards/devops-standards.md |
| seo | seo-auditor | docs/standards/seo-standards.md |

Steps:

1. **Gather the artifact.** Ask the user what to review if unclear; otherwise use the obvious artifact: the current `git diff` (or branch diff vs `uat`) for build/db/api gates, wireframes or specs for the design gate, workflow/config changes or live URLs for release/seo gates.
2. **Spawn the agent** from the table with the artifact and feature name in the prompt. Wait for its report.
3. **Relay the report to the user beginner-friendly:** lead with the verdict, then findings in plain language (what could go wrong, not just what rule was broken). Do not soften FAILs.
4. **If the verdict has findings**, offer to fix them now. After fixes, re-run the agent (back to step 2).
5. **Ask the user for their decision:** approve / approve with conditions / reject. **The user is the final authority — never record an approval they did not explicitly give.**
6. **Record it.** Create `docs/signoffs/<feature-slug>.md` from `docs/signoffs/TEMPLATE.md` if missing, then fill that gate's row: date, git SHA (`git rev-parse --short HEAD`), agent verdict, user decision, conditions.
7. Tell the user which gate is next in the pipeline order: design → db → api → frontend/backend → release → seo (skip gates that don't apply to this feature, and note the skip in the ledger with reason).

## Hard rules

- One gate per invocation. Do not batch-approve.
- A REJECT verdict still gets recorded in the ledger (as rejected) — history is part of the audit trail.
- For db/api gates: the review happens BEFORE implementation when possible; if reviewing after-the-fact, note that in the ledger.
