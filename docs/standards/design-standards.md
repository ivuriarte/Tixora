# Design Rulebook — Axon Tickets

**Who reads this:** the `design-reviewer` agent at the Design gate.
**Status: STARTER DRAFT** — extracted from the live codebase. Ian reviews and extends this; the design gate is only as good as this file.

**Plain-English goal:** every screen looks like it belongs to the same product, works on a phone, and works for people with disabilities.

---

## Brand tokens (observed in the codebase — verify/extend)

- **Brand color:** deep purple `#4C1D95` (theme color; hero/CTA family)
- **Font:** Inter, weights 400 / 500 / 600 / 700, `display: swap`
- **Neutrals:** Tailwind gray scale (`gray-100` skeletons, `gray-200` borders, `gray-800/900` dark surfaces)
- **Corners:** cards `rounded-2xl`, smaller elements `rounded-xl`
- **Shell:** sticky white navbar (`h-16`, `border-b border-gray-200`), content in `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`
- **Loading:** skeletons with `animate-pulse` on `bg-gray-100` blocks — never spinners for full pages
- **Motion:** `animate-fade-in-up` page transitions

## Hard rules

1. **Web and mobile web first.** Every screen is designed at both desktop width and phone width — neither is an afterthought. A screen is incomplete until both layouts exist (most PH ticket buyers are on mobile, so the phone layout is never skippable).
2. **Reuse before invent:** check `src/components/` for an existing component; new one-off variants of buttons/cards/inputs are findings.
3. **Every screen designs all four states:** loading (skeleton), empty ("no events yet" with a next action), error (friendly message + retry), and success.
4. **WCAG AA:** 4.5:1 contrast for body text, 3:1 for large text; touch targets ≥ 44px; visible focus states; never color as the only signal (e.g., status = color + label).
5. **UAT banner stays** on non-production environments — users must always know they're on a test site.
6. **Registration funnel screens change only with funnel review** — they're conversion-critical and instrumented (Meta Pixel + internal funnel events). Moving/removing steps needs explicit sign-off.

## Content rules

7. Prices always show the peso sign and full amount: `₱500`, `₱1,250` — no decimals unless centavo precision genuinely exists (it shouldn't).
8. Dates in Philippine-friendly format with weekday: "Sat, Aug 15, 2026 · 7:00 PM".
9. Buttons say what they do ("Send my code", "Upload payment proof") — no bare "Submit" / "OK".
10. Error messages say what happened *and* what to do next; never expose technical internals.

## SEO handshake (checked here at design time, built at the Frontend gate)

11. Every new public page type declares at design time: its URL pattern, its title/description template, and what plain-text facts must be visible on the page (see seo-standards).

## What the reviewer checks, in order

1. Matches brand tokens (color, type, corners, shell)?
2. Both desktop and mobile web layouts designed?
3. All four UI states present?
4. Contrast, touch targets, focus, color-independence?
5. Reuses existing components?
6. Copy follows content rules (prices, dates, buttons, errors)?
7. New public page: URL + metadata + visible-facts plan declared?
