# Gate Ledger — Event drafts and step navigation

**Started:** 2026-10-01
**Branch:** `feat/event-step-navigation` (Release A), worktree `Tixora-wt-event-drafts`, from `origin/uat` `96c85ee`
**One-line description:** Save unfinished event setup to the organizer's account, let organizers open any setup step in any order, and show one server-enforced checklist before publishing.

**Artifacts:** `docs/specs/event-drafts-and-step-navigation.md` (revision 2), `docs/specs/event-drafts-and-step-navigation-wireframes.html`

| Gate | Date | Git SHA | Agent verdict | Ian's decision | Conditions / notes |
|---|---|---|---|---|---|
| Design | 2026-10-01 | 7c8cc50 (docs uncommitted) | PASS WITH CONDITIONS (round 1: 8 findings; round 2: all 8 fixed, 1 new count mismatch, fixed after review) | Approved with conditions (delegated, 2026-10-02) | Progress counts corrected to the D4 counting rule after round 2. Rulebook gaps noted below. |
| Database | 2026-10-01 | 7c8cc50 (docs uncommitted) | APPROVE (round 2) | Approved (delegated, 2026-10-02) | No migration. C1 (delete relies on existing RESTRICT foreign keys) and C2 (race-safe conditional update) met. Round 2 note on stray checkout quotes added to A7. |
| API | 2026-10-01 | 7c8cc50 (docs uncommitted) | APPROVE WITH CONDITIONS (round 2: conditions 1–6 met) | Approved with conditions (delegated, 2026-10-02) | Round 2 condition (delete 409 message + read-only fee in Release A frontend) added to Section 9. Implementation notes for A1/A7 carried to the backend gate. |
| Frontend | | | | | Not started (after design approval) |
| Backend | | | | | Not started |
| Release | | | | | Not started |
| SEO | | | | | Skip expected: admin-only screens, no public page changes |

**Decisions (2026-10-02):** Ian delegated the eight design decisions to Claude's recommendation in writing ("For the Decisions you need from me, I will rely on your best recommendation"). Recorded outcomes:

1. D1 save at valid title, venue and dates: approved.
2. D2 autosave drafts only, Save changes on every step for published events: approved.
3. A2 server-enforced publish checklist on any draft-to-public change, with the additive error-filter change: approved.
4. A3 append-only audit, draft-save window, field names only: approved.
5. A6 slug refresh before first publish: **skipped.** Draft preview links on the Event previews page use the slug (`/events/{slug}?preview=1`), so changing it would break preview links organizers already shared.
6. A7 events with registrations or orders can't be deleted: approved.
7. A8 platform-only service fee and featured fields: approved.
8. Two-release plan with existing-risk fixes in Release A: approved.

## Notes

- Existing issues found during this review, scheduled for Release A: organizers can set the platform service fee and featured placement (A8); event delete removes registrations, orders and audit rows (A7); event update audit rows store bank and e-wallet account numbers (A3); `status` accepts any string (A2).
- Known limitation accepted in the spec: tier edits don't change `Event.updatedAt`, so conflict detection covers event fields only.
- Rulebook gaps raised by the design reviewer: design-standards names `#4C1D95` as the brand color but the live primary is `#7C3AED`; it says cards use `rounded-2xl` while many live cards use `rounded-lg`; no rule for time-only save stamps; no rule on whether 44px targets apply on desktop; the bottom sheet is a new pattern pending approval here.
