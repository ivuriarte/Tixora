# Sign-off Ledger

This folder is the **approval logbook** for the gate system. One file per feature, created from `TEMPLATE.md`.

**Plain-English version:** before any feature moves to its next phase, an AI inspector reviews it and Ian approves it. This folder is the paper trail — who approved what, when, at which commit. If something breaks later, the ledger shows exactly which gate let it through, so the *rulebook* gets fixed, not just the bug.

## How it works

1. Run `/gate <phase> <feature-name>` in Claude Code (phases: design, db, api, frontend, backend, release, seo).
2. The matching inspector agent reviews against its rulebook in `docs/standards/`.
3. Ian gives the final decision — the agent only recommends.
4. The decision is recorded here with the git SHA.

## Rules

- No phase proceeds without its row filled in (or an explicit "skipped — reason" entry).
- Rejections are recorded too. History never gets deleted.
- `seo-visibility-log.md` in this folder tracks the monthly AI-citation-rate audit results over time.

## Relationship to existing process

This extends (does not replace) `docs/release-process.md` and the UAT sign-off in `docs/UAT-SIGN-OFF-TEMPLATE.md` — UAT acceptance remains the final human gate before production.
