# UI/UX Structure Spec — Marketing Website Foundation

**Feature:** marketing-website-foundation · **Date:** 2026-07-09 · **Author:** Claude (chauffeur mode), decisions by Ian
**Design system:** current live brand tokens — primary `#7C3AED`, secondary `#4C1D95`, Inter 400–700, `rounded-2xl` cards, existing `Button`, `EventCard`, `Navbar`, `UatBanner` components. This is NOT the DICE restyle (tokens unratified — see homepage-revamp ledger).

This is a structure + copy spec, not a visual wireframe. Layout language: existing Tailwind patterns (`page-container` = `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`).

---

## Global changes

### Navbar (edit, minimal)
- Unauthenticated desktop + mobile menu: link "Become an organizer" relabeled **"For organizers"** → `/organizers`.
- No other navbar changes. Auth flows untouched.

### Footer (new, rendered only on marketing surfaces)
- Dark band (`bg-gray-900`), 4-column desktop → stacked single column mobile.
- Col 1: Axon logo + one-line blurb ("Ticketing and registration for events in the Philippines.").
- Col 2 "Discover": Browse events (`/`), event category links (6 × `/solutions/*`).
- Col 3 "Organizers": For organizers (`/organizers`), Apply as organizer (`/become-organizer`).
- Col 4 "Contact": Facebook page link → https://www.facebook.com/axonentertainment.ph (external, `rel="noopener noreferrer"`, opens new tab).
- Bottom row: © 2026 Axon Tickets.
- Legal pages (Terms/Privacy) exist only as in-app modals today — **no footer legal links in this pass** (avoids broken links); documented as future work.
- Footer renders only on `/`, `/organizers`, and `/solutions/*`. It is intentionally absent from auth, registration, checkout, payment-proof, OTP, account, and admin surfaces.

---

## Page 1 — Homepage `/` (marketplace mode only; featured-event mode untouched)

Section order:

### 1.1 MarketingHero (new)
- Light background (white → `bg-primary-50` gradient allowed), NOT the dark carousel style.
- **H1 (the page's only h1):** "The modern ticketing and registration platform for events in the Philippines."
- Subline: "Create event pages, take registrations, and check people in with QR codes — whether you're running the event or attending it."
- CTAs (side-by-side desktop, stacked full-width mobile, both ≥44px):
  - Primary: **"Create Your Event"** → `/become-organizer` · `data-track="homepage-create-event"`
  - Secondary (outline): **"Find Events"** → `#upcoming-events` anchor · `data-track="homepage-find-events"`
- Static content — no loading/empty/error states apply.

### 1.2 FeaturedHeroCarousel (existing, unchanged)
- Rendered only when featured events exist (current behavior, including auto-rotation). Known pre-existing gap: no pause control — logged as future work, not modified in this pass.

### 1.3 Upcoming Events grid (existing, minor)
- Gets `id="upcoming-events"` + `scroll-mt` for the anchor. Grid, pagination, EventCard untouched.
- Empty state (if API returns zero events): "No upcoming events yet — check back soon." + link to `/organizers`. Error state (fetch fails): "Couldn't load events right now. Please refresh to try again." — no technical internals.

### 1.4 HowItWorksSection (new)
- H2: "How it works". Two labeled columns (side-by-side desktop, stacked mobile):
  - **For organizers** — 1. Create your event · 2. Share your event page · 3. Accept registrations or ticket purchases · 4. Validate attendees with QR check-in · 5. Track attendees and reports.
  - **For attendees** — 1. Choose an event · 2. Register or reserve a ticket · 3. Receive confirmation and QR code by email · 4. Present your QR code at the event.
- Numbered list markup (`<ol>`), static.

### 1.5 TrustSection — feature highlights (new)
- H2: "Everything you need to run an event". Grid of FeatureCards (2-col mobile, 3-col desktop), **verified-implemented features only**:
  Public event pages · Online registration · OTP email verification · QR code tickets · QR check-in validation · Email confirmations · Organizer dashboard · Payment proof collection · Attendee records & reports.
- No "coming soon" items in v1 (nothing unverified is listed at all). No card-payment claims.

### 1.6 EventCategoryCards (new)
- H2: "Built for every kind of event". 6 cards (2-col mobile, 3-col desktop, each card fully clickable, ≥44px):
  Conferences → `/solutions/conferences` · Fun Runs → `/solutions/fun-runs` · Church Events → `/solutions/church-events` · School Events → `/solutions/school-events` · Corporate Events → `/solutions/corporate-events` · Concerts → `/solutions/concerts`.

### 1.7 Final CTASection (new)
- Purple band (existing OrganizerCtaSection visual pattern). H2: "Ready to run your next event with Axon Tickets?"
- Button: **"Start Organizing"** → `/become-organizer` · `data-track="homepage-start-organizing"`.

**SEO (rule 11):** URL `/` (existing). Title: "Axon Tickets — Online Ticketing Philippines". Meta description: "Axon Tickets helps organizers create event pages, manage registrations, send QR codes, and run smoother events in the Philippines." Plain-text facts visible without JS: hero H1, event names/dates/prices in grid (server-rendered), category names.

---

## Page 2 — `/organizers` (new; priority page)

### 2.1 Hero
- **H1:** "Sell tickets, manage attendees, and run better events with Axon Tickets."
- Subline: "Axon Tickets gives organizers the tools to create event pages, manage registrations, send QR codes, validate attendance, and track event data in one platform."
- CTAs (≥44px, stacked mobile):
  - Primary: **"Create Your Event"** → `/become-organizer` · `data-track="organizer-create-event"`
  - Secondary: **"Talk to Us on Facebook"** → https://www.facebook.com/axonentertainment.ph · `data-track="organizer-request-demo"` · external icon, new tab, `rel="noopener noreferrer"`.

### 2.2 OrganizerPainPoints (new)
- H2: "Running events on spreadsheets is costing you". Grid of short pain cards (1-col mobile, 2-col tablet, 3-col desktop):
  Manual registration tracking · Scattered Google Forms and spreadsheets · Payment proof confusion · Long check-in lines · Missing attendee records · Confirmations sent one by one · No visibility on how the event is doing.

### 2.3 Solution section
- H2: "One platform for the whole event". FeatureCards mapping pains → solutions:
  Branded public event pages · Online registration · QR code ticketing · Automatic confirmation emails · Attendee list management · QR check-in validation · Reports and exports.

### 2.4 UseCaseCards (new)
- H2: "Made for events like yours". 5 cards linking to solutions pages: Conferences, Fun runs, Corporate seminars (→ corporate-events), Church gatherings (→ church-events), School events.

### 2.5 Why Axon Tickets
- H2: "Why organizers choose Axon Tickets". Bullets (credible, no market-leadership claims):
  Built around Philippine event workflows (GCash-friendly payment proof, PH phone formats) · Simple organizer experience — event live in minutes · Attendee-friendly registration with OTP email verification · QR-based validation at the door · A foundation that grows with your events.

### 2.6 Final CTA
- H2: "Launch your next event with Axon Tickets." Button: **"Create Your Event"** → `/become-organizer` · `data-track="organizer-create-event-footer"`.

**States:** fully static page — no loading/empty/error states apply (no data fetching).
**SEO (rule 11):** URL `/organizers` (new public page type). Title: "For Event Organizers — Axon Tickets". Meta description: "Create and manage events with Axon Tickets. Built for organizers who need ticketing, registration, QR check-in, attendee records, and event reports." OG inherits root image. H1 as above; all copy server-rendered plain text.

---

## Page 3 — `/solutions/[category]` (new; one template, 6 static configs)

- `generateStaticParams` for the 6 slugs; unknown slug → 404 (`notFound()`).
- Config per category: slug, name, H1, subline, meta description, 4 benefit bullets, example use line.
- Template sections: Hero (H1 + subline + "Create Your Event" CTA · `data-track="solutions-{slug}-create-event"`) → 4 benefit FeatureCards → condensed How-it-works (organizer steps 1–5) → CTASection ("Run your next {category name} on Axon Tickets") + link "Browse events" → `/`.
- Copy per category stays factual (e.g., conferences: agenda/program sections, tiered tickets, QR check-in — all existing features; fun runs: registration + QR validation at start line). No category-specific features invented.
- **States:** static — none apply.
- **SEO (rule 11):** URL pattern `/solutions/[category]`. Title template: "{Category} Ticketing & Registration — Axon Tickets". Description from config. H1 category-specific. Server-rendered.

---

## Page 4 — Public event pages `/events/[slug]`

**No changes.** Verified already present: event name (h1), date/time, venue, organizer, description, image, agenda, instructions via custom sections, registration CTA. Registration/OTP/QR/payment flows untouched.

---

## Cross-cutting requirements

- **Accessibility:** one h1 per page; sections use `<section>` + h2; all CTAs are real `<a>`/`<button>` ≥44px; visible focus (`focus-visible:ring-2 ring-primary ring-offset-2`); body text ≥ gray-600 on white (4.5:1+); icons decorative (`aria-hidden`) with text labels; category/use-case cards are single anchor elements (no nested links).
- **Responsive:** mobile-first single-column stacks; hero CTAs full-width < `sm`; grids 1→2→3 cols; no horizontal scroll at 375px.
- **Content rules:** prices only appear in the events grid (existing peso format); dates only via existing EventCard/format utils; buttons say what they do; error copy = what happened + what to do.
- **UAT banner:** untouched at top of root layout; marketing pages render their footer after `<main>` — banner behavior unchanged.
- **Analytics:** `data-track` attributes only (listed above); no new analytics scripts. Meta Pixel/funnel tracking untouched.
- **New components** live in `src/components/marketing/`: MarketingHero, TrustSection, HowItWorksSection, FeatureCard, UseCaseCard, EventCategoryCards, OrganizerPainPoints, CTASection, Footer. Server components, no client JS except none required.

## Known limitations / future work
- FeaturedHeroCarousel auto-rotates without a pause control (pre-existing; fix with DICE restyle).
- No Terms/Privacy standalone pages — footer omits legal links until they exist.
- `/solutions/*` pages are intentionally thin v1 scaffolds for future campaign content.
- Testimonials/logos/stats sections deferred until real social proof exists (no fabricated numbers).
