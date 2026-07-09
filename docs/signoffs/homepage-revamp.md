# Gate Ledger — homepage-revamp

**Started:** 2026-07-07
**Branch:** codex/product-packages-mvp
**One-line description:** DICE-style restyle of the public homepage (navbar + search, featured hero carousel, event grid, organizer CTA band).

| Gate | Date | Git SHA | Agent verdict | Ian's decision | Conditions / notes |
|---|---|---|---|---|---|
| Design | 2026-07-07 | 5f70473 | REJECT | Rejected | Round 1 — wireframes desktop-only, no states, accessibility failures. See notes. |
| Design | 2026-07-07 | 5f70473 | APPROVE WITH CONDITIONS | Approved with conditions | Round 2 — v2 deck addresses mobile frames, states, contrast, touch targets, focus spec, UAT banner, dates, carousel pause. Four pre-build conditions remain (see notes). |
| Database | | | | | |
| API | | | | | |
| Frontend | | | | | |
| Backend | | | | | |
| Release | | | | | |
| SEO | | | | | |

**Decisions:** Round 1 rejected — wireframes incomplete (desktop-only, no states, accessibility failures). Round 2 approved with conditions — v2 passes all hard checks except four pre-build conditions listed below.

## Notes

**Round 1 (2026-07-07, artifact: `output/wireframes/axon-dice-wireframes.html`) — design-reviewer verdict REJECT.** Blocking findings:

1. No mobile web frames anywhere in the deck (desktop-only 4-col grid, side-by-side hero).
2. Only success state designed — no loading / empty / error frames.
3. Stone text `#9e90b0` on white ≈ 2.97:1 contrast (AA floor is 4.5:1) on event dates/availability.
4. CTAs specced 40px, drawn 26–34px (rule: ≥44px touch targets) — includes "Reserve Your Seat" and "Sign Up".
5. No focus states on any interactive element.
6. Deck introduces new brand tokens (primary `#7C3AED`, purple neutrals, 8px corners, weight-900 display) not ratified in design-standards.md.
7. Three inconsistent date formats on one screen (rule 8 format: "Sat, Aug 15, 2026 · 7:00 PM"); sample dates say 2025.
8. UAT banner slot missing from the revamped shell.
9. Out of scope for this gate: deck also restyles Event Detail and Auth (funnel screens — need funnel review per hard rule 6 before their own gates).

**Rulebook changes made during this gate:** hard rule 1 amended by Ian from "Mobile-first (desktop is the enhancement)" to "Web and mobile web first" — both layouts co-equal and required.

**Round 2 — v2 fixes confirmed:**
- Mobile web frames added (288px, 4 phone frames: success, loading, empty, error)
- Loading skeletons, empty state + CTA, error state + retry — all present
- Stone text #9e90b0 → #756a92 (4.9:1 on white, AA)
- All homepage CTAs upgraded to 44px; carousel pause button 44px on both breakpoints
- Focus spec panel added (2px solid #7C3AED, 2px offset, system-wide)
- UAT banner slot added above navbar, references APP_ENV
- Dates unified to "Sat, Oct 17, 2026" format; sample year corrected to 2026
- Carousel pause control added (44px, WCAG 2.2.2)

**Pre-build conditions (must be cleared before frontend build starts):**
1. **Token ratification** — Ian updates docs/standards/design-standards.md with new primary (#7C3AED), corner radius (8px), and neutral palette, OR deck reverts to current rulebook tokens. *(still pending Ian's decision)*
2. **Mobile nav expanded state** — ✅ RESOLVED 2026-07-07: hamburger-open frame added showing 56px nav rows (clears ≥44px), unauthenticated and authenticated states shown.
3. **Event grid card dates** — ✅ RESOLVED 2026-07-07: time added to all desktop and mobile card date strings (e.g. "Sat, Oct 17, 2026 · 8:00 AM").
4. **Search input ARIA spec** — ✅ RESOLVED 2026-07-07: callout updated with concrete implementation spec: `<form role="search"><input type="search" aria-label="Search events"></form>`.

**Conditions deferred to Frontend gate:**
5. --slt (#6b5b8a) contrast on white formally confirmed in ratification doc.
6. Desktop hero date two-row layout — clarify whether intentional exception to rule-8 single-string format.

**Out-of-scope violations noted for other gate passes:**
- Event Detail (Tab 2): "Get Tickets" / "Share Event" at height:34px
- Org Status (Tab 9): three action buttons at height:34px
- Ticket selection: quantity +/- buttons at 24×24px
- Event Detail / Ticket Detail / Order Success: date format inconsistencies (long weekday names, day-first, year 2025)

**Rulebook gaps flagged by reviewer (follow-ups):** no ARIA/semantic HTML requirements rule; no rule requiring expanded nav state in mobile wireframes; no carousel pause-control rule (WCAG 2.2.2); no token ratification process defined; SEO rule 11 covers only new page types, not redesigns of existing public pages.
