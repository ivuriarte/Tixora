# Frontend Rulebook — Axon Tickets

**Who reads this:** the `frontend-reviewer` agent at the Frontend build gate.
**Plain-English goal:** every page works for everyone, loads fast, never trusts itself with business math, and is fully readable by search engines and AI assistants.

---

## Hard rules (violating any = gate REJECT)

1. **Public pages are server-rendered.** Event pages, listings, and anything a crawler should see must render full content without JavaScript (AI crawlers execute zero JS). Client components are for interactivity, not for primary content.
2. **No business math in the browser.** Prices, discounts, and totals come from the API. The client displays; the server decides. (Display formatting like `toFixed(2)` is fine.)
3. **Every public page exports Metadata** (Next.js Metadata API): title, description, OpenGraph — following the `layout.tsx` pattern. Event pages generate these from event data.
4. **Event detail pages include JSON-LD `schema.org/Event`** with `offers` (price in PHP, availability), `location` (venue + address), `startDate`/`endDate`, and `image`. This is what qualifies events for Google rich results and AI-assistant citations.
5. **No secrets in client code.** `NEXT_PUBLIC_*` env vars are public by definition — nothing sensitive goes there.
6. **`NEXT_PUBLIC_APP_ENV`**, never `NODE_ENV` checks in app code.

## Accessibility rules (findings to fix before approval)

7. One `<h1>` per page; heading levels don't skip.
8. Every meaningful image has real `alt` text (empty `alt=""` only for decorative).
9. Interactive elements are buttons/links, not clickable divs; forms have labels; focus states visible.
10. Color contrast meets WCAG AA (4.5:1 body text). Brand purple `#4C1D95` on white passes; verify any new combinations.

## Design rules (findings to fix before approval)

11. **State:** auth via the existing Zustand store (`src/store/auth.store.ts`); no parallel auth state.
12. **All UI states designed:** loading (skeletons — existing `animate-pulse` pattern), empty, and error states, not just the happy path.
13. **Registration flows fail safe:** the funnel must work when Meta Pixel or analytics are blocked (existing reliability requirement).
14. **Bundle discipline:** shared first-load JS baseline is ~87 kB. A PR that pushes it up noticeably must justify why (new heavy dependency = finding).
15. **Slugs are stable.** If a public URL must change, a 301 redirect ships in the same PR.
16. **Tailwind + existing component patterns** — reuse `src/components/` before inventing new primitives.

## What the reviewer checks, in order

1. Is indexable content server-rendered?
2. Metadata export present and correct on new public pages?
3. JSON-LD Event markup on event pages, complete and valid?
4. Client-side business math?
5. a11y: h1, alt text, labels, contrast?
6. Loading/empty/error states present?
7. New heavy dependencies or bundle jumps?
8. Secrets or non-public data in client code?
9. URL changes without redirects?
