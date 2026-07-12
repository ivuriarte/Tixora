# Gate Ledger — meal-stub-coffee-stub-print

**Started:** 2026-07-09
**Branch:** feat/marketing-website-foundation
**One-line description:** Tier inclusions system with combined nametag + stub strip PDF and revamped branded nametag design.

| Gate | Date | Git SHA | Agent verdict | Ian's decision | Conditions / notes |
|---|---|---|---|---|---|
| Design | 2026-07-09 | 049997c | APPROVE | Approved | Helvetica approved as documented PDF-surface exception (Inter applies to web/screen only). Rulebook gap noted: docs/standards/design-standards.md has no PDF/print surface clause — follow-up task to add one. |
| Database | 2026-07-09 | 049997c | APPROVE WITH CONDITIONS | Approved with conditions | (1) Rollback = code revert only — no DROP TABLE in migration PR. (2) Add @@unique([tierId, label]) to prevent duplicate stubs. (3) RLS join-path policy validated in Supabase editor before UAT. (4) PDF query shape documented in migration PR so index decision is explicit. |
| API | 2026-07-09 | 049997c | APPROVE WITH CONDITIONS | Approved with conditions | (1) @Transform trim on DTOs at implementation (not @Trim). (2) Formal waiver: TierInclusion list is bounded by tier count — no pagination needed. (3) PDF generation moves to background job (job-based architecture, not synchronous endpoint). |
| Frontend | 2026-07-09 | 049997c | APPROVE WITH CONDITIONS | Approved | (1) aria-live scoped to per-tier status lines only, not dialog element. (2) Chips implemented as <button> with focus:ring-2 focus:ring-primary. (3) Progress modal uses Modal.tsx (Headless UI) or manual focus-trap + focus-return. (4) Button visibility: hasInclusions flag piggybacked onto events list OR separate fetch with defined loading/error defaults. (5) Progress modal error state fully specced before coding: server message, fallback, Retry + Close buttons, poll back-off. (6) Polling via TanStack Query refetchInterval only — no setInterval/setTimeout. (7) TierInclusion chips live in TierForm.tsx inside existing event wizard; new page requires design gate. |
| Backend | 2026-07-09 | 049997c | APPROVE WITH CONDITIONS | Approved | All 7 original findings resolved. Three new: (8) QStash webhook must verify Upstash-Signature using Receiver.verify() — returns 401 on fail — QSTASH keys in .env.example + environment-matrix.md. (9) Per-event job concurrency guard via redis.setIfNotExists('pdf-job-lock:{eventId}') with 35min TTL — 409 if already in-flight. (10) main.ts line 45 NODE_ENV fallback removed in same cleanup commit. |
| Release | | | | | |
| SEO | | | | | |

## Decisions

- **Design — Approved** (2026-07-09): Full spec approved including tier inclusions chip interface, combined nametag+stub strip PDF, tier-grouped PDF with divider pages, dynamic strip height calculation, and branded nametag revamp. All 7 rejection findings resolved before approval.
- **Database — Approved with conditions** (2026-07-09): TierInclusion child table approved. Two blockers to apply at migration-write time: (1) no DROP TABLE in rollback — code revert only; (2) add @@unique([tierId, label]) to prevent duplicate stub sections. Two PR-time conditions: RLS join-path policy validated in Supabase editor; PDF query shape documented so index decision is on record.
- **Backend — Approved with conditions** (2026-07-09): Re-submission after resolving 2 hard blockers. Final conditions locked in: QStash webhook signature verification (Receiver.verify(), 401 on fail, QSTASH keys documented); per-event concurrency guard (setIfNotExists, 409 on duplicate); main.ts line 45 NODE_ENV fallback removed; three .spec.ts files mandatory in PR (tier-inclusions, pdf-jobs, nametag-renderer). All prior 7 findings confirmed resolved.
- **Backend — REJECTED first submission** (2026-07-09): Two hard blockers resolved by decision before re-submission: (1) Job architecture: install @upstash/qstash — POST /nametags publishes to QStash; QStash calls a webhook processor endpoint (POST /admin/jobs/process) in its own serverless invocation with maxDuration raised. QStash free tier (500 msg/day) confirmed adequate; verify pricing at upstash.com/pricing before PR merges. (2) Tests: admin.service.spec.ts (and new service spec files) must ship with the PR — not after. Five conditions also locked: (3) TierInclusion CRUD extracted to apps/api/src/tier-inclusions/; PDF job logic extracted to apps/api/src/pdf-jobs/ — AdminService delegates only. (4) No bulk-reorder endpoint at MVP — sortOrder updated one PATCH at a time; no transaction needed. (5) TierInclusion mutations write audit.log() (tier_inclusion.created/.updated/.deleted) with before/after metadata. (6) Unknown/expired jobId returns { status: 'expired', error: 'Job result is no longer available' }. (7) Three existing process.env.NODE_ENV references in app.module.ts (lines 43, 45) and config/configuration.ts (line 2) migrated to APP_ENV in this PR.
- **Frontend — Approved with conditions** (2026-07-09): 7 conditions apply at implementation time: (1) aria-live scoped to per-tier status lines only; (2) chips as <button> elements with visible focus rings; (3) progress modal uses Headless UI Dialog (Modal.tsx) or manual focus-trap + focus-return; (4) hasInclusions check plan and its loading/error states decided before build; (5) progress modal error state fully written before coding — server message, fallback, Retry + Close, poll back-off; (6) polling via TanStack Query refetchInterval, not setInterval; (7) inclusions chip UI in TierForm.tsx — new page requires design gate.
- **API — Approved with conditions** (2026-07-09): Three conditions apply at implementation time: (1) @Transform trim on all DTO string fields (not the invalid @Trim decorator); (2) Formal pagination waiver — TierInclusion list is bounded by the number of tiers on an event, list-all is acceptable; (3) **PDF generation is a background job**: organizer triggers POST → server enqueues job and returns { jobId } → client polls GET /admin/jobs/:jobId/status (Redis-backed, ~1–2s interval) → progress tracks tier-by-tier → completed PDF uploaded to Cloudinary with signed URL → client auto-downloads. Synchronous nametag endpoint replaced by this job-based path. Vercel 10s timeout risk resolved by removing the synchronous execution path entirely. Waiver on Finding 2 recorded here as the formal ledger entry.

## Notes

**Feature scope (agreed during BA/design phase):**
- Tier inclusions are free-text, organizer-defined labels (e.g. "Meal", "Coffee", "Race Bib") — not hardcoded booleans. Extensible to any future inclusion type without schema migration.
- Data model: `TierInclusion` child table (`tierId`, `label`, `stubEnabled`, `sortOrder`).
- Combined strip per attendee: nametag (100mm × 40mm) + N stub sections (each 100mm × 20mm) joined by a continuous 3mm purple left accent bar.
- PDF grouped by tier sort order. Each tier section prefixed by a divider page. Strip height computed per tier: `40mm + (N × 20mm)`. Strips per column: `floor(277mm / (strip_height + 3mm))`.
- Print button ("Print nametags & stubs") hidden when no tiers have inclusions — feature is invisible to organizers who don't use it.
- Separate "Print meal stubs" / "Print coffee stubs" buttons removed. Single combined action replaces them.
- Nametag revamp: `#4C1D95` header band, `#7C3AED` left accent bar, `#F5F3FF` footer tint, tier pill + reference number in footer.
- PDF font exception: Helvetica (pdf-lib StandardFonts). Approved. Inter is web/screen only.

**Rulebook gaps discovered:**
- `docs/standards/design-standards.md` has no PDF/print surface rule. Handled via documented exception this cycle. A print surface clause should be added before the next feature that generates PDFs.

**Rejected first attempt (2026-07-09):**
First gate submission had no wireframe or spec. Returned FAIL (no artifact). Feature was fully scoped through BA/solutions architect session before re-submission.
