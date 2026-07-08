# Gate Ledger — marketing-website-foundation

**Started:** 2026-07-09
**Branch:** feat/marketing-website-foundation (PR target: uat)
**One-line description:** Marketing website foundation — brand-led homepage, /organizers conversion landing page, /solutions/[category] template for six event categories, footer, SEO metadata. Current brand style (not DICE restyle).

| Gate | Date | Git SHA | Agent verdict | Ian's decision | Conditions / notes |
|---|---|---|---|---|---|
| Product/Business | 2026-07-09 | 5f70473 | n/a (plan review) | Approved | Four decisions recorded (see notes). |
| Design | 2026-07-09 | 5f70473 | APPROVE WITH CONDITIONS | Approved with conditions | 5 conditions folded into build (see notes). Footer scoped to marketing pages only. Carousel-pause WCAG gap deferred (accepted risk, see below). |
| Database | 2026-07-09 | 5f70473 | n/a | Skipped | No schema changes — marketing pages are frontend-only, no new tables. |
| API | 2026-07-09 | 5f70473 | n/a | Skipped | No new/changed endpoints — pages consume existing public /events APIs only. |
| Frontend | 2026-07-09 | 214409e | APPROVE | Approved | Lint and typecheck passed; production build passed; 202 API tests passed; desktop and 375px mobile verified with one h1, no horizontal overflow, CTA sizing ≥44px, marketing-only footer scope, valid 404 behavior, and no browser console errors. Two pre-existing `no-img-element` warnings remain outside this feature's changed files. |
| Backend | 2026-07-09 | 5f70473 | n/a | Skipped | No apps/api changes. |
| Release | | | | | |
| SEO | | | | | |

**Decisions:** Product/Business gate approved 2026-07-09 —

1. **Design style:** current brand tokens (#7C3AED primary, existing components, rounded-2xl). DICE restyle stays a separate feature pending token ratification (see homepage-revamp ledger).
2. **Solutions pages:** one /solutions/[category] dynamic route + per-category config; six categories (conferences, fun-runs, church-events, school-events, corporate-events, concerts).
3. **Contact CTA:** Facebook page link — https://www.facebook.com/axonentertainment.ph (provided by Ian 2026-07-09).
4. **Homepage hero:** new brand-led marketing hero on top; FeaturedHeroCarousel preserved as the section below it. Featured-event mode (NEXT_PUBLIC_FEATURED_EVENT_SLUG) untouched.

**Scope guarantees (Gate 1 confirmations):**
- Homepage (dual-audience trust) and /organizers (organizer conversion) have distinct purposes; /organizers is the priority page.
- Public event pages remain event-specific and functionally untouched.
- Copy claims only verified-implemented features: public event pages, attendee registration, OTP email verification, QR tickets + check-in, email confirmations, organizer dashboard, event workspace, manual payment proof upload, attendee records, analytics/exports. No online card-payment claims. No market-leadership claims.
- No changes to /auth/*, /admin/*, /account/*, registration/OTP/QR/email/payment flows, stores, or API client.

## Design gate (2026-07-09) — conditions accepted into build

1. Footer rendered on marketing surfaces only (/, /organizers, /solutions/*) — NOT in root layout; funnel screens (checkout, registration, payment, OTP) stay footer-free. (Ian's decision.)
2. FeaturedHeroCarousel heading demoted h1 → h2 so MarketingHero owns the page's single h1.
3. Final CTA reuses/extends OrganizerCtaSection (props for heading/label/data-track); hide-when-authenticated behavior preserved on homepage.
4. Homepage events grid: skeleton loading state; getEvents distinguishes error (null → "Couldn't load events" copy) from empty ([] → "No upcoming events yet" copy).
5. **ACCEPTED RISK (Ian, 2026-07-09):** FeaturedHeroCarousel auto-rotates without a pause control (WCAG 2.2.2). Deferred to the DICE homepage restyle, which already designed a 44px pause control (see homepage-revamp ledger). Not fixed in this feature.

Non-blocking build-time fixes adopted: data-track renamed organizer-request-demo → organizer-contact-facebook; /solutions/* footer links under "Organizers" column, not "Discover"; "event live in minutes" copy softened; approval-lead-time note (1–2 business days) shown near "Create Your Event" CTAs.

Follow-ups logged (not this feature): formatShortDate in packages/utils omits weekday/time (rule 8 gap); rulebook should enumerate live tailwind palette, add accepted-risk mechanism, footer-surface rule, marketing-truthfulness rule, external-link guidance.

## Notes

Pipeline (chauffeur mode): plan ✓ → UI/UX spec + design gate → build → lint/typecheck/tests/build → frontend gate (code review + verifier) → regression check of golden paths → push feature branch + PR to uat → Ian approves merge → UAT deploy only. **Production is out of scope — no merge to main.**
