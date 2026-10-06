# Design Spec — Checkout dead end and unfinished orders (Release 1)

**Feature:** checkout-dead-end-and-incomplete-orders · **Date:** 2026-10-03 · **Author:** Claude, decisions by Ian
**Status:** Design phase, revision 2.5 (D4 no longer points to the unmonitored support mailbox; warm age-friendly copy approved by Ian 2026-10-06; Contact is the primary button when an organizer page exists; no-organizer variant and its risk accepted; design delta round 3 conditions 1 to 8 applied). Nothing in this spec is implemented yet.
**Design reference:** `docs/standards/design-standards.md` is the only design rulebook in the repo (`DESIGN.md`, named in `CLAUDE.md`, does not exist yet). Recorded as a rulebook gap in the ledger.
**Wireframes:** [`checkout-dead-end-and-incomplete-orders-wireframes.html`](./checkout-dead-end-and-incomplete-orders-wireframes.html)
**Follows:** `uniform-holds-and-sold-vs-held.md` (live in production 2026-10-03, PR #75).

---

## 1. Problem

A customer ("order A", early October 2026) paid and uploaded a payment proof, but the order never reached the organizer's Verification Queue, so it could not be approved. The payment was safe. The customer was left with no explanation and no way forward. The queue correctly hides orders whose attendee details are not saved; the failure was that the **customer was never guided to the missing step and hit a silent dead end**.

### Verified facts (production data, API logs, code on `main` at `2251bfa`)

| Fact | Evidence |
|---|---|
| The customer's order had a stored proof, 0 attendee rows, `attendees_completed_at` NULL, status `proof_submitted`. | Supabase queries run by Ian on 2026-10-03 |
| The customer had earlier started a **guest** order ("order B", no account, no email) and uploaded the same payment screenshot to it. | Audit history of order B; the receipt time and the proof upload time match |
| Minutes later the customer logged in with an emailed code (new login, not an existing session), then **five** `PATCH /registrations/<order B id>/attendees` requests returned **404**. They then started a new order and uploaded the proof again. No attendee save was ever requested for the new order. | Vercel production request logs; funnel events |
| `PATCH /registrations/:id/attendees` only finds orders owned by the logged-in account. A guest order has no owner, so it always answers 404. | `registrations.service.ts` `updateAttendeesForRegistration` (`findFirst({ id, userId })`) |
| The register page decides its mode by one rule with no ownership check: guest token present → guest flow; otherwise logged in + a registration id in the address → logged-in flow. The page checks the order **once at load, before login**, and swallows a failure. After login it never re-checks. | `register/page.tsx` `loadPage` and the render branches |
| Linking a guest order to an account requires the guest's private token (`claim-and-complete`). Without the token it must not be linked. | `registrations.service.ts` `claimAndComplete` → `assertGuestAccess` |
| The confirm step is not recorded in funnel tracking, so a failure there is invisible. | `funnel.constants.ts`, `RegistrationForm.tsx` |
| The admin order page shows an enabled **Approve & Verify** button for an order whose details are missing; the server then refuses it with "Attendee details must be completed before approval." | `admin/registrations/[id]/page.tsx` `canReview`; `registrations.service.ts` `approve` |

### Not verified (stated honestly)
- **Why their browser had no guest token** when they logged in (a new tab or session is the likely reason). The fix does not depend on it.
- **Why the second order stalled.** No attendee save was ever attempted for it. Tracking (D6) is added to find out next time.

## 2. Goals and non-goals

**Goals**
1. A customer never meets a silent dead end in checkout. When something cannot proceed, the page says so in warm, plain words and offers a safe way forward.
2. Customers are told clearly that one more step remains after the payment screenshot, and what happens if they stop.
3. The confirm step becomes visible to us (started, succeeded, failed, with a reason).
4. An organizer never sees a button that cannot work: an unfinished order's Approve button explains itself.

**Non-goals (explicitly parked, with triggers to revisit)**
- Any change to the Verification Queue, or a new "Unfinished registrations" page.
- Reminder emails, an early email field for guests, a "Continue your registration" prompt.
- Automatic completion of orders, and linking an order to an account **without** the guest token (a security rule, never done).
- A shared single-box email field, group-order specific changes, saving partial group details.
- Any API endpoint or database change.

## 3. Design decisions

### D1. Ownership check on the register page
When the visitor becomes (or already is) logged in, the page has a registration id in the address, and **no guest token**, the page calls `GET /registrations/:id` once before showing any form.
- **404** → the order is not this account's: show the "can't continue" screen (D4). Send no attendee request.
- **200** → continue as today.
- **Any other failure** (network, 5xx) → continue as today; D2 is the safety net.
It re-runs when the login state changes (the case in the logs: the page loaded unauthenticated, then the visitor logged in).

### D2. Safety net on the save request
In the logged-in flow, if `PATCH /registrations/:id/attendees` returns 404, the form stops, shows the same screen (D4), and **does not retry automatically**. The button is not left enabled for repeated identical attempts.

### D3. Payment page
For a logged-in visitor, if `GET /registrations/:id` returns 404, show the same screen (D4) instead of the generic "We could not load your registration."

### D4. The "can't continue" screen
A new variant, `notyours`, of the existing end-screen component (`ReservationEndState`).
- **Style:** it is a "went wrong" state, so it uses **`ErrorState`** (`role="alert"`, like the existing `elsewhere` variant), not the calm `EmptyState`.
- **Heading structure:** the title renders as the component's normal `<h2>`. On the payment page, which returns early, `pageHeading` adds a hidden page `<h1>`. For this variant the hidden heading reads **"Your registration"** (the existing "Your reservation" is wrong here). The register page already has an `<h1>` (the event title), so it does not set `pageHeading`.
- **Copy, rev 2.5 (warm, short, age-friendly; approved by Ian 2026-10-06; one string for every screen size).** Plain words, no "sign-in", "order" or email address; three short left-aligned paragraphs, each starting with the situation in bold so a reader can find their own case:
  - Title: **We couldn't open this registration**
  - Paragraph 1: *We're sorry for the trouble. This registration may have been started with a different email or account from the one you're using now, so we can't show it here.* ("may have been": the same 404 also answers for a removed or invalid registration, so the cause is not stated as fact.)
  - Paragraph 2 (with an organizer page): ***If you already paid:*** *please keep your payment receipt (a screenshot is fine). Note the amount, the time you paid, and the reference number on it. Then contact the organizer and share those details.*
  - Paragraph 2 (**no organizer page**): ***If you already paid:*** *please keep your payment receipt (a screenshot is fine). Note the amount, the time you paid, and the reference number on it. Then get in touch with the people who run this event, using the page or post where you first found it.*
  - Paragraph 3: ***If you haven't paid yet:*** *you can start again.*
  - **Buttons, with an organizer page (Ian's decision 2026-10-06: Contact first):** the **primary (filled) button is `Contact {organizer name}`**, a real link to `/organizers/<organizerSlug>#official-links`, 44 px minimum height, text may wrap for long names. Directly under it, a helper line at **16 px**: *Opens their page. Look for "Official links" to reach them.* The link carries `aria-describedby` pointing at that line, and its accessible name starts with the visible text. **`Start again` is the outlined secondary button** below it (back to the event page), so a customer who already paid is not drawn to pay twice.
  - **Buttons, no organizer page:** `Start again` only, also the outlined secondary style (same style in both variants for consistency).
  - The Contact link is shown **only when the event has a public organizer slug and name**.
  - **No promise of help.** The copy never says the organizer "can help" or "will fix it". An organizer cannot complete a buyer's missing details (only the buyer, or an Axon admin by hand), so the copy only tells the customer what to keep and where to go.
  - **Escalation path (Ian, 2026-10-06):** when a customer reaches an organizer with a stuck registration, the organizer raises it with Axon in the **external Messenger group chat** that Axon and the organizers share, and Axon supports from there (an Axon admin completes or fixes the registration by hand, as was done for order A). This is operational, not in the product. The details to ask for are the amount, the time and the reference number.
  - **Text size (age-friendly):** on this screen only, body text, the helper line and the buttons use `text-base` (**at least 16 px**; it renders at **18 px** because the site scales its root font to 112.5% in `globals.css`) with 44 px minimum height, the title is the component's `text-lg` (18 px) or larger, text is **left-aligned**, and horizontal padding is reduced at 320 px. Build scope: **no change to `ScreenState.tsx` defaults or the shared COPY map.** `ErrorState` is extended to accept a node as its message and an optional className (defaults to today's centered 14 px string), and `ReservationEndState` gets a dedicated rendering path for `notyours` only. The platform-wide 16 px rule remains the separate decision in the ledger.
  - **Organizer page change (small, in the build):** put `id="official-links"` on the "Official links" `<aside>` in `apps/web/src/app/organizers/[slug]/page.tsx` with a scroll offset for the sticky navbar (e.g. `scroll-mt-24`), and make its "Official links" label at least 14 px (today it is 10 px uppercase), because it is the words the customer is told to look for.
  - **No support email address appears on this screen (rev 2.3).** `support@axontickets.online` has no one reading it (Ian, 2026-10-06), so a paid customer must never be sent there. The same address still appears in the footer, the payment page, the become-an-organizer page and customer emails; that is out of scope here and recorded as a follow-up.
  - **Where the slug comes from, no API change:** the public event response already returns `organizerSlug`. The register page already loads the event. The payment page loads only the registration, so on the 404 path it makes **one extra** `GET /events/:slug` (only when blocked) to read the slug. If that call fails, the screen simply omits the link.
  - **Known risk, ACCEPTED by Ian 2026-10-06:** the public organizer page has no phone or email, only links the organizer filled in ("No external links published." when empty), and a hidden or non-public organizer has no page. The event page links to the organizer page but shows no contact details of its own (checked live on 2026-10-06 on one live organizer's event: Facebook and Instagram links, so it is reachable). For an organizer with no links, a paid customer has **no route to a human** from this screen except asking where they found the event, and Ian accepts that: the customer then contacts the organizer themselves. Operational follow-up, not a release blocker: each organizer of a live event should have at least one official link filled in.
- No order details, no reference number, no promise about the payment either way (we cannot see it from here). No blame in the wording.

### D5. "One last step" message (merged into the existing card, no second banner)
The checkout completion screen already has an emerald card on the **confirmation** stage ("Proof uploaded successfully … Nothing is finalized until you confirm."). Release 1 **rewrites that card** and adds the same card on the **details** stage. It does **not** add a second banner. It is plain content (no live-region role), rendered in the same position in both stages, so it is not re-announced when the stage changes.

**Confirmation stage** (logged-in single ticket starts here; everyone else reaches it after the details stage):
- Title (h2): **Thank you, we've received your payment screenshot.**
- Body: **One last step:** check your order below, then press **Confirm Transaction** at the bottom. *Until you finish, the organizer cannot see your registration.*
- For guests and "use my account" buyers the button is **Confirm and Send My Code**, and the body adds: *We'll then email you a 6-digit code to finish.*

**Details stage** (group orders, guests, "use my account"; the only button there is "Review Transaction Details"):
- Title (h2): **Thank you, we've received your payment screenshot.**
- Body: **One last step:** enter the details of everyone attending, then press **Review Transaction Details**. You'll check everything on the next screen. *Until you finish, the organizer cannot see your registration.*

**Not shown** on the email-code stage or the final "Transaction submitted" screen. The button names in the card come from the same constants as the buttons themselves, so they cannot drift.

**Text size.** The shared end screens and cards use the existing sizes (`text-sm` body, `text-xs` uppercase buttons; because the site root font is 112.5%, these render at 15.75 px and 13.5 px, not the 14 px and 12 px a default Tailwind setup would give). Release 1 keeps them, to stay consistent with the sibling screens. A 16 px minimum for customer text is a rulebook gap, not a rule today. It is recorded in the ledger for Ian to decide as a separate, platform-wide change.

**Decisions on the round-2 design findings**
- The card only renders when a payment proof is actually stored for that order. The register page already loads the order (including its proofs) and passes a `proofUploaded` flag to the form. If there is no proof, no "we've received your screenshot" text is shown.
- The small "Payment & Proof" eyebrow label on the existing card is **kept** on both stages, for consistency with the stepper.
- The checking state uses the existing `ScreenSkeleton` plus one visible line, "Checking your registration…", so a phone user on slow data sees a clear wait message.
- The disabled Approve button keeps the page's existing disabled style (the green button at reduced opacity). The grey in the wireframe is illustrative.
- The hidden page heading in `ReservationEndState` becomes per-variant ("Your registration" for `notyours`, "Your reservation" for the rest).

### D6. Tracking (no screens)
Four new funnel steps, sent through the existing funnel endpoint. Our own fields carry **no email, token or registration id**, only the event id and four small metadata fields. The tracker also adds the page address automatically (`currentUrl`, fragment already stripped); on the register and payment pages that address can contain the registration id, exactly as for today's funnel events. That is unchanged, and the id alone gives no access: every read still needs ownership or the guest token.
- `details_confirm_started` (started) when the customer presses the confirm button
- `details_confirm_succeeded` (success)
- `details_confirm_failed` (failed), metadata `{ mode, httpStatus, code }`
- `order_not_owned_seen` (blocked), metadata `{ where: 'register' | 'payment' | 'confirm' }`
Added to the API list of allowed steps and the web type. The admin analytics page gets readable labels for them in `labelForStep`; they are **not** added to the funnel counts list (`trackedSteps`) and there are **no new charts**. The metadata for these four steps is a **fixed shape** (`mode`, `httpStatus`, `code`, `where`). `code` is chosen from a **fixed list** (`not_found`, `validation`, `throttled`, `network`, `server`, `other`) derived from the HTTP status, and is **never** taken from an error message. No email field is sent. A test asserts that the fields we set are exactly these (it does not assert on the automatic `currentUrl`). The events are read from the funnel table (for example with SQL) until we decide otherwise.

### D7. Admin order page
For an order in `proof_submitted` or `pending_approval` whose details are not complete, the page's `Review` block changes:
- **Complete** means exactly what the server checks when approving: attendee rows equal the ticket count **and** `attendeesCompletedAt` is set. The page already receives `attendeeCount`, `attendees` and `attendeesCompletedAt` from `GET /admin/registrations/:id` (the response spreads the whole registration), so **no API change is needed**.
- **Approve & Verify** is disabled. Directly above the buttons, an amber notice (the page's existing rounded notice style, `role="status"`): **Waiting for the buyer's details.** *The payment proof is saved. You can approve once the buyer finishes their details.* The disabled button points at the notice with `aria-describedby`, so screen readers hear the reason.
- **Reject** stays available. At 320 px the two buttons keep the existing equal-width row.
- A complete order is unchanged. The Verification Queue is unchanged.

## 4. API contract
**No new or changed endpoint.** The allowed values of the existing public `POST /funnel/events` `step` field grow by four (the DTO validates `step` against the same list, so adding the names extends validation and Swagger together). An **old** API rejects the new names with a 400 at the DTO; the web tracker is fire-and-forget (errors swallowed, no retry, no UI), so this is invisible to customers. Existing rate limits apply. The 404 answers the spec relies on were verified in code: `GET /registrations/:id` and `PATCH /registrations/:id/attendees` both answer 404, never 403, for an order the caller doesn't own, so ids cannot be probed. The web must key off the **status code**, not the message.

## 5. Database
**No change.** Database gate: skipped, with reason.

## 6. Screens and states
See the wireframes: the "can't continue" screen (desktop and 320 px), the banner for logged-in and guest modes, and the admin order page for an unfinished order. States: normal, checking (short skeleton while the ownership check runs), error-open (the check fails for another reason), and the blocked screen.

## 7. Test plan
- **Playwright (mocked API):**
  - logged in, registration id in the address, no token, `GET /registrations/:id` = 404 → blocked screen, **zero** attendee requests, "Start again" goes to the event page;
  - login happens after the page loads (page starts unauthenticated) → the ownership check runs after login;
  - `PATCH …/attendees` = 404 → blocked screen, exactly **one** request, no retry;
  - ownership check returns 5xx → form still shown;
  - payment page 404 → blocked screen;
  - the rewritten card on the confirmation stage and the new card on the details stage, with the right button name per mode, no second banner, and not shown on the code or done stages;
  - the blocked screen, with an organizer slug and name: the **primary button is "Contact {organizer name}"** (a link to `/organizers/<slug>#official-links`), the helper line is present (at least 16 px) and referenced by `aria-describedby`, and **"Start again" is the outlined secondary button** placed after it; without an organizer slug or name: no Contact link, the "no organizer page" paragraph 2, and "Start again" only. In both variants: no `mailto:` link, no support address, none of the words "sign-in" or "order", the cause sentence reads "may have been started", the paid paragraph asks for the amount, the time and the reference number, body text is left-aligned and at least 16 px, and on the payment page a failed slug lookup still shows the screen without the link;
  - **other end screens unchanged:** the other `ReservationEndState` variants and the default `ErrorState` still render the centered standard message at 15.75 px (regression assertion), and `ScreenState.tsx` defaults are untouched;
  - the organizer page has an element with `id="official-links"` (also when the organizer has **zero** links), with a scroll offset, and its "Official links" label is at least 14 px;
  - at 320x568 the no-link variant and the with-link variant render without horizontal scroll, and the fold (where "Contact" and "Start again" start) is measured and recorded in the PR;
  - at 320 px: the blocked screen (including the organizer link) and the admin Review block;
  - admin: unfinished order → Approve disabled with the notice and `aria-describedby`, Reject enabled; complete order → Approve enabled; the page uses the same predicate as the server's approval check;
  - all existing checkout, guest-hold, member-hold and admin suites unchanged.
- **API (Jest):** the funnel service stores the four new steps and still ignores unknown ones (service level; the DTO-level check would answer 400); the DTO accepts the four names and rejects others; `findById` and `updateAttendees` raise `NotFoundException` for (a) a guest-owned order called with a logged-in user id and (b) another user's order.
- **Payload test (Playwright):** the confirm-step funnel requests contain exactly the four fixed metadata fields we set, with `code` from the fixed list, and no email or token in any field we set.
- **Golden paths after the change:** registration (guest, logged-in single, logged-in group), referral, admin verification, event creation.

## 8. Rollout
Feature branch → PR into `uat` → UAT deploy green → promotion PR to `main` (Ian merges). No migration, no new environment variable. Rollback = previous Vercel deployment (web and API). A short web-ahead-of-API window is harmless: the web would send new funnel step names that the old API rejects with a 400, which the fire-and-forget tracker ignores (tracking only; no customer impact).

## 9. Risks and open points
- **Wording** (D4, D5) is approved by Ian at the design gate.
- **Funnel sign-off (rule 6):** this adds a card and a blocked screen to the registration funnel. It moves or removes no step, changes no Pixel event, and changes no internal funnel event except adding four. Ian's explicit funnel sign-off is recorded in the ledger.
- **Backend gate to confirm:** no organizer-scoped caller depends on the platform-admin-only `GET /admin/registrations/:id` shape (pre-existing, outside this change).
- **Optional later hardening, not in this release:** cap the size and keys of funnel metadata (pre-existing gap, noted by the API review).
- **Recovery still depends on a human.** The blocked screen does not complete the order. A paid customer must reach the organizer, who can then complete or reject it. Preventive follow-ups are parked: Release 2 (auto-complete the confirm step for logged-in single-ticket buyers, with the review moved to the payment page) and a later reminder email plus resume link (with an early guest email) for groups and guests. Ian approved this direction on 2026-10-06.
- **Orphaned guest order:** the earlier guest order (like order B) still exists with its screenshot until an organizer rejects it. Out of scope here.
- **The 404 check relies on the API answering 404 for "not yours".** That is the current behavior and is covered by a test.
