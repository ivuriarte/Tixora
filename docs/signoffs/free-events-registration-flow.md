# Gate Ledger — free-events-registration-flow

**Started:** 2026-07-09
**Branch:** feat/marketing-website-foundation
**One-line description:** Support free (₱0) ticket tiers — new `pending_approval` status replaces `proof_submitted`, unified `/registrations/[id]` status page for all flows, 24-hour orphan expiry with 12-hour reminder email.

| Gate | Date | Git SHA | Agent verdict | Ian's decision | Conditions / notes |
|---|---|---|---|---|---|
| Design | 2026-07-09 | 049997c | APPROVE WITH CONDITIONS | Approved | C1: CountdownTimer JS-disabled fallback uses `text-gray-600` minimum. C2: Rejected status fallback copy added — "No reason was provided. If you think this is a mistake, contact the organiser." C3 (funnel sign-off): Ian explicitly approved removal of `/events/[slug]/register/payment/[registrationId]` in favour of unified `/registrations/[id]` page; analytics remapping documented in spec (InitiateCheckout fires on `pending_payment` render, `Registration_Free_Submitted` custom event added for free flow). |
| Database | 2026-07-09 | 049997c | APPROVE WITH CONDITIONS | Approved | C1: PR must state that `pending_approval` enum value is permanent in PostgreSQL (no DROP VALUE support); rollback = DML revert (`UPDATE ... SET status = 'proof_submitted' WHERE status = 'pending_approval'`) + application code revert only. C2 (waiver): Pre-existing `Decimal(10,2)` money columns (`TicketTier.price`, `Registration.total/subtotal/fees/discount/unitPrice`, `Event.platformFee`) violate the integer-pesos storage rule but are out of scope for this feature. Ian approved waiver 2026-07-09; remediation migration to be tracked as a separate backlog item. No centavo conversion is performed — the spirit of the rule is upheld. |
| API | 2026-07-09 | 049997c | APPROVE WITH CONDITIONS | Approved | C1 (MUST): Add `pending_approval` to `canReview` in `admin/registrations/[id]/page.tsx:169` and `VerificationDrawer.tsx:246`; add to bulk-eligibility filter in `admin/verifications/page.tsx:185,193,383,404`. C2 (MUST): Add `pending_approval` to verifications queue filter dropdown and set as default UI state. C3 (MUST at backend gate): Verify `isFree` and free-branch condition are computed from `tier.price`+`platformFee` server-side, never from client input. C4 (SHOULD before UAT): Cap cron reminder email sends per invocation (≤200) or use Resend batch API to avoid Vercel 10s timeout. C5 (SHOULD before UAT): Confirm cron response shape matches existing cron endpoints (`{ ok, reminded }` vs standard envelope). |
| Frontend | 2026-07-09 | 049997c | APPROVE WITH CONDITIONS | Approved | First review: REJECT (2 MUSTs). Fixed: operator-precedence bug in `selectedEligible` (`verifications/page.tsx:197`); edit-mode routing replaced client-side `isFreeEdit` arithmetic with server-returned `initialIsFree` prop. Conditions C1 and C2 (display-only cleanup) fixed before Ian's approval: `isFree` fallback arithmetic removed (`registrations/[id]/page.tsx:160`); dead `pending_approval && !isFree` heading branch removed (line 333). |
| Backend | 2026-07-09 | 049997c | APPROVE WITH CONDITIONS | Approved | F1 (MUST): Added 15 unit tests across `registrations.service.free-events.spec.ts` (11 tests: isFreeEvent branch in createImpl, approve() guard, email routing) and `scheduler.service.spec.ts` (4 tests: remindPendingRegistrations). F2 (SHOULD): Escaped `eventTitle` and `referenceNumber` via `this.escapeHtml()` in both new email methods. F3 (NICE): Admin controller default changed from `proof_submitted` to `pending_approval` so free registrations appear in the default queue. All fixed before approval. |
| Release | 2026-07-09 | 3e2ad3e | APPROVE WITH CONDITIONS | Approved | Collective branch review (all commits on feat/marketing-website-foundation). C1 (SHOULD): Added Slack failure notification to remind-pending-registrations cron job — fixed before approval (commit 3e2ad3e). C2 (SHOULD, before main): Confirm registrations row count for unbatched UPDATE in migration.sql:17 is safe, or pre-run batched SQL manually. Query and batched script provided to Ian. Pre-existing gap: cleanup-orphan-registrations also lacks failure notification — tracked as separate backlog item. |
| SEO | — | — | SKIPPED | Skipped | No new public pages introduced. All changed pages are authenticated (account, admin). |

## Notes

### Design gate — first attempt: REJECT
First review (2026-07-09) rejected on 7 counts: emoji-only status icons, no mobile layout spec, missing loading/error/post-resend UI states, no accessibility confirmation on status text, missing upload button specs, no component reuse declaration, missing SEO handshake.

### Design gate — second attempt: APPROVE WITH CONDITIONS
Revised spec v2 addressed all 7 REJECT conditions. Three residual conditions resolved:
- C1 and C2 resolved by spec clarification (color token and fallback copy).
- C3 required Ian's explicit funnel-change sign-off per Rule 6 — given 2026-07-09.

### Rulebook gaps discovered (flagged by reviewer for standards updates)
1. Rule 11 (SEO handshake) only covers public pages — no rule for authenticated page robots treatment. Should be extended.
2. No rule covering inline post-action feedback states (success/failure text replacing a button).
3. No email design standards in the rulebook (layout, branding, link safety).

### Funnel analytics remapping (C3)
| Pixel event | Old trigger | New trigger |
|---|---|---|
| `InitiateCheckout` | Page load `/payment/[id]` | `/registrations/[id]` renders with `pending_payment` (useEffect on status) |
| `AddPaymentInfo` | Proof upload on payment page | Proof upload on `/registrations/[id]` (already present at line 92) |
| `Registration_Submitted_For_Review` | Proof upload on payment page | Proof upload on `/registrations/[id]` (already present at line 97) |
| `Registration_Free_Submitted` (new) | N/A | `/registrations/[id]` renders with `pending_approval` for free event |
| `Purchase` | `/registrations/[id]` on `verified` | Unchanged |

### API gate — APPROVE WITH CONDITIONS (2026-07-09)
Key finding: multiple frontend files hardcode `proof_submitted` as the only approvable/rejectable status. C1 and C2 must be resolved as part of the Frontend implementation before any code ships. C3 is a backend gate verification item. C4/C5 are pre-UAT.

### Database gate — APPROVE WITH CONDITIONS (2026-07-09)
- **C1 (rollback note):** `pending_approval` enum value is permanent in PostgreSQL — `ALTER TYPE ... DROP VALUE` is not supported. Rollback = DML revert + code revert only. Must be stated explicitly in the PR description.
- **C2 (money column waiver):** All monetary columns (`TicketTier.price`, `Registration.total/subtotal/fees/discount/unitPrice`, `Event.platformFee`) are stored as `Decimal(10,2)`, which predates this feature and violates the integer-pesos storage rule in `db-standards.md`. Ian approved waiver 2026-07-09. No centavo arithmetic is performed anywhere in the codebase — the no-conversion rule is upheld. Remediation (converting to integer columns) is a separate backlog item.
- **Concurrency note (non-blocking):** The `UPDATE registrations SET status = 'pending_approval' WHERE status = 'proof_submitted'` data migration should be run during a low-traffic window or batched in chunks of ~1000 rows to avoid long-held row locks on the `registrations` table.
