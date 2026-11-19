# Gate Ledger — Playwright browser install no longer fails the gate when Ubuntu's apt mirrors are down

**Started:** 2026-11-19
**Branch:** `fix/uat-playwright-install-resilient`, from `origin/uat` at `e418681`
**One-line description:** CI jobs ran `npx playwright install --with-deps <browser>`, which also runs `apt` against Ubuntu's mirrors. On 2026-11-19 those mirrors were down (503, network unreachable, timeouts), and the Deploy UAT admin regression job failed twice at that step after about 4m40s, before any test ran. A shared script now treats the browser download as required, the apt step as best effort with a 150 s cap, and launches each browser once so a really missing library still fails the step.
**Artifacts:** `scripts/ci/install-playwright.sh` (new) and 8 one-line edits in `.github/workflows/deploy-uat.yml` (3), `test-and-build.yml` (1), `uat-regression.yml` (4). No env, secret, permission, action or version change.

| Gate | Date | Git SHA | Agent verdict | Ian's decision | Conditions / notes |
|---|---|---|---|---|---|
| Design | 2026-11-19 | | SKIP | PENDING | CI only. |
| Database | 2026-11-19 | | SKIP | PENDING | No schema, migration or table. |
| API | 2026-11-19 | | SKIP | PENDING | No route or DTO. |
| Frontend | 2026-11-19 | | SKIP | PENDING | No web source change. |
| Backend | 2026-11-19 | | SKIP | PENDING | No API source change. |
| Release | 2026-11-19 | `e418681` + working-tree diff (before commit) | APPROVE WITH CONDITIONS (devops-reviewer). All 8 checks PASS or N/A once the conditions are met. | PENDING | Conditions: (1) the new script must be staged with the workflow edits (done; without it all 8 steps fail with "No such file"); (2) PR body carries the rollback line (done); (3) after merge, run `uat-regression` once by `workflow_dispatch` on `uat` to exercise firefox and webkit, because the weekly cron runs the default branch (main). Nit applied: the warning now prints the real exit code (124 = timeout) and writes to the step summary. |
| SEO | 2026-11-19 | | SKIP | PENDING | No public page. |

**Decisions:** Ian has not recorded a decision on this gate. Nothing is approved on his behalf.

## Rollback
Revert this commit: it restores `--with-deps` at the 8 call sites. No schema, env or secret impact.

## Accepted limits and follow-ups
- **`ci.yml:84` is not changed** (`cd apps/web && npx playwright install chromium --with-deps`, job `e2e-smoke`). It is the production pipeline and needs the owner's explicit go. It does not block a production deploy (`deploy-api` needs `lint-typecheck`, `api-unit-tests`, `migrate-prod`), but the same outage would turn CI red on `main`. Suggested replacement: `cd apps/web && bash "$GITHUB_WORKSPACE/scripts/ci/install-playwright.sh" chromium`.
- The launch check does not detect missing fonts; no test in `apps/web/e2e` uses screenshot comparison, so the residual risk is cosmetic.
- Not verified on a real runner: a `sudo apt-get` child in its own session could survive the timeout's SIGKILL and be left running. No later step in these jobs uses apt, and the runner reaps leftovers at job end.
- `${{ matrix.browser }}` in `uat-regression.yml` is interpolated unquoted; the values are constants in the same file. Optional hardening: pass it via `env:`.
- Verification here: stub tests (fake `npx` and fake `@playwright/test`) for success, apt exit 100, apt hang, download failure, missing library, three-browser matrix and no arguments; YAML parses; `bash -n`; no shellcheck or actionlint available locally. The PR's own Test & Build run exercises the chromium path before merge.
