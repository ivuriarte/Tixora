# Design Spec — Event Drafts and Free Step Navigation

**Feature:** event-drafts-and-step-navigation · **Date:** 2026-10-01 · **Author:** Claude, decisions by Ian
**Status:** Revision 2. Design approved 2026-10-02 (decisions in `docs/signoffs/event-drafts-and-step-navigation.md`). Release A in development on `feat/event-step-navigation`.
**Wireframes:** [`event-drafts-and-step-navigation-wireframes.html`](./event-drafts-and-step-navigation-wireframes.html)
**Design system:** current live admin tokens: primary `#7C3AED`, deep purple `#4C1D95`, text `#1a0533`, admin canvas `#f5f0ff`, borders `#e4dcf4`, Inter 400–700, `rounded-2xl` cards, existing `WizardShell`, `Stepper`, `ReviewStep`, `ConfirmModal`, `ScreenState` (`ScreenSkeleton`, `EmptyState`, `ErrorState`), `Skeleton`.

---

## 1. Problem

Organizer feedback (Andrew, Loft Bed Theater, 2026-09-30):

- Lost event setup work 4–5 times while stepping away mid-setup. The logout bug behind this is fixed and live (PR #66, #67), but the setup flow still keeps unfinished work only in one browser.
- Had to finish all six steps in order before anything was saved, then went back to fix or add information.

## 2. What exists today (verified in code)

| Area | Today | Gap |
|---|---|---|
| New event (`/admin/events/new`) | 6-step `WizardShell`. Progress autosaves to **this browser only** (`useEventDraft.ts`, `localStorage`) with a Restore banner. On the last step, one submit creates the event (status `draft`), its tiers and referral codes. | Nothing reaches the server until step 6. Stepper blocks forward jumps (`Stepper.tsx` `canClick`). Every step's validation blocks **Next**. |
| Edit event (`/admin/events/[id]`) | Same `WizardShell`, with `allowIncompleteNavigation` (free step jumps). Tier add/edit/delete saves immediately. Status dropdown in the top banner saves immediately. | All other fields save only via **Save Changes**, which appears on the **Review step only**. No autosave, no local backup, no leave-page warning. |
| Publishing | Status dropdown → `PUT /admin/events/:id {status:'on_sale'}`. Server checks cover image and (paid events) complete payment methods. | Client-side Review checks are not enforced by the server (title/description/venue/dates/tiers). |
| Review step | `ReviewStep` shows per-section errors with **Edit** links, first error per step only. | Not a complete "what's left" list; no Publish action. |
| Events list (`/admin/events`) | Status filter includes **Draft**. | No "continue editing" affordance or progress for drafts. |
| Data model | `Event.status` defaults to `draft`; required columns without defaults: `title`, `venue`, `startsAt` (`slug` is derived). `endsAt` is nullable in the database but required by the create endpoint. Public queries only return `on_sale`/`sold_out`/`completed`. | None. **No schema change is needed.** |
| Found during review (existing issues) | Organizers can send `platformFee`, `isFeatured`, `featuredOrder`, `featuredUntil` on create/update, and checkout charges attendees that fee. Event update audit rows store full field values, including bank and e-wallet account numbers. Event delete removes registrations, orders and their audit rows. `status` is validated only as a string. | Fixed as conditions of this feature (A2, A3, A7, A8). |

## 3. Goals and non-goals

**Goals**

1. No unfinished event setup is lost to a logout, closed tab, crash, or switching device.
2. Organizers can open any step at any time, in any order, for new and existing events.
3. One clear list of what is still needed before publishing, enforced by the server.
4. Works for every existing event with no data migration.

**Non-goals**

- Collaborative real-time editing. Two editors are handled with conflict detection, not merging.
- Version history or undo of saved edits.
- Changing the public event page, registration funnel, or payment flow. (Design rule 6: funnel screens are untouched.)

## 4. Design decisions

### D1. When a new event is saved to the account

A new event is saved to the server **as soon as it has a valid title, venue, start and end date/time**, from whichever step the organizer is on. Valid means what `POST /admin/events` already accepts: title and venue at least 3 characters, end after start, start not in the past. The database requires only title, venue and start; the create endpoint also requires the end date. Waiting for these means no placeholder data and no schema change. If the create request is refused (for example a validation error), the work stays in the browser and the indicator shows the reason.

- Before that point: the existing browser autosave keeps working. The save indicator says so plainly (see D3).
- At that point: the page creates the event (`POST /admin/events`, status `draft`, unchanged endpoint), then creates any tiers and referral codes already added (unchanged endpoints), clears the browser copy, and replaces the URL with `/admin/events/{id}?step={current}` so the organizer stays on the same step with nothing re-rendered away.
- From then on, a new event and an existing event use the same screen and the same save behavior.
- **Back to events** (renamed from Cancel) leaves the page and keeps the browser copy, so the dashboard's existing Restore banner can bring it back. To throw the work away, the organizer uses **Discard** on that banner.
- The **Basics** step no longer blocks on description or cover image. Those move to the publish checklist (D4), where they are still required before publishing.

### D2. Saving rules

| Event status | How changes save |
|---|---|
| `draft` | **Autosave.** 2 seconds after typing stops, on every step change, and when the tab is hidden. Sends only changed fields. One request in flight at a time; later changes queue behind it. |
| `on_sale`, `sold_out` | **Explicit save**, because changes go live immediately. A **Save changes** button sits in the footer on **every** step (not only Review). Unsaved edits are backed up in this browser, and leaving the page with unsaved edits asks for confirmation. |
| `cancelled`, `completed` | Unchanged from today. |

Rules that apply in all modes:

- **Tiers** keep saving immediately (existing tier endpoints). In a new event before D1, they stay local as today and are created at D1.
- **Payment QR images** upload as soon as they are chosen (existing `/upload/payment-qr`), instead of at save time, so a saved draft never references a file that exists only in the browser.
- **Items being written** inside the Agenda, FAQ, Sponsors and Custom section editors are saved when the organizer clicks that item's **Add** or **Save** button. Autosave never sends a half-filled item (the API requires those items' fields).
- **Browser backup** of unsaved changes is kept per event (`tixora:event-edit:{eventId}:v1`) until the server confirms the save. If a backup newer than the server copy exists when the editor opens, a banner offers **Restore my changes** or **Discard**.
- Every save sends the exact `updatedAt` string the server last returned. If someone else saved in the meantime, the server refuses (409) and the page shows the conflict state (D3). The organizer's unsaved changes stay in the browser backup.
- **Restoring after a conflict** re-applies only the fields this organizer changed, on top of the latest server version, and shows them as unsaved. For drafts, autosave then sends them with the new `updatedAt`. It never replays a full old copy over someone else's save.
- **Save and exit / Save and leave while offline or failing:** the organizer stays on the page and sees the "Couldn't save" state. The page never navigates away before the server confirms.
- **Known limitation:** tier add/edit/delete uses separate endpoints that don't change `Event.updatedAt`, so conflict detection covers event fields, not tiers. Tier saves remain immediate and last-write-wins, as today.

### D3. Save status indicator

One indicator in the wizard header, always in the same place. Status is never shown by color alone: every state has an icon and words.

| State | Label | When |
|---|---|---|
| Local only | **Saved on this device.** "Add a title, venue and dates to save it to your account." | New event before D1 |
| Saving | **Saving…** | Request in flight |
| Saved | **Draft saved · 2:14 PM** (drafts) / **All changes saved** (published) | Server confirmed. Time only when saved today; otherwise "Draft saved · Tue, Sep 29, 2026 · 9:05 PM". |
| Unsaved | **Unsaved changes** | Published event with edits not yet saved |
| Offline or failed | **Couldn't save. Your changes are kept on this device.** + **Try again** | Network error, 5xx, or rate limit. Retries automatically after 10s, 30s, 60s. |
| Conflict | **This event was changed somewhere else.** + **Load latest version** | 409 from the server |
| Session ended | Existing sign-in redirect returns to this step. Unsaved changes are restored from the browser backup. | 401 that refresh can't recover |

### D4. Step navigation and the publish checklist

- Every step in the stepper is clickable, for new and existing events. **Next** and **Back** never block.
- Each step chip shows exactly one status, always as icon + word (+ color):

  | Status | Meaning |
  |---|---|
  | **Current** | The step on screen. |
  | **Done** | All publish requirements for this step are met. |
  | **Needs info** | The organizer has entered something on this step and at least one requirement is unmet. |
  | **Not started** | Nothing entered yet on this step. |
  | **Optional** | Program & Details with nothing entered (counts as ready unless it is a running event, where its race settings are required). |
  | **Edited** | Published event only: this step has unsaved changes. |
  | **N items left / Ready** | Review step only: the number of unmet requirements across all steps. |

- Counting rule used by the mobile step bar ("Step 3 of 6") and the events list ("2 of 5 ready"): count the steps shown for that event. Free events hide Payment, so they show 5 steps. "Ready" counts exclude Review itself, so a paid event is "N of 5 ready" and a free event "N of 4 ready".
- Problems on the current step show inline next to their fields, but never stop navigation.
- **Review** becomes **Ready to publish?**: a complete list of every remaining requirement, not just the first per step. Each item links to its step and focuses the field.
- **Publish event** (drafts) is always enabled. If requirements are missing, pressing it moves focus to the list and states how many items are left. The server runs the same checks and is the final authority.
- Published events show **Save changes** on this step instead of Publish.
- Publish requirements (existing client rules, now also enforced by the server):
  - Title, description, cover image
  - Venue, address, city, start date/time, end date/time, end after start, start not in the past (new events only)
  - Capacity greater than zero, at least one ticket tier, tier quantities add up to capacity
  - Running events: race distances, age groups (valid, continuous, not overlapping), race divisions, merchandise sizes
  - Paid events: at least one complete bank or e-wallet payment method (name, account name, account number)

**Mobile (under 768px):** the six-chip stepper is replaced by a compact bar: "Step 3 of 6 · Capacity & Tiers", a text status line ("Needs info · 1 step needs info"), a segmented progress strip hidden from screen readers (`aria-hidden`), and an **All steps** button (44px) that opens a bottom sheet listing all steps with their status. The sheet is a **new pattern** built on the existing Headless UI `Modal` (focus trap; Escape, a tap outside, or its Close button closes it; focus returns to the button). Swipe-down to close was dropped in Release A: Headless UI doesn't provide it, and adding a gesture library isn't justified for one sheet. Footer buttons stick to the bottom of the screen with 44px targets.

**Dialogs:** the publish confirmation and the leave-page dialog (Save and leave / Leave without saving / Stay on this page) extend the existing `ConfirmModal` with a `primary` variant and an optional third action, rather than a one-off copy.

**Checklist links:** each "Fix" link is at least 44px tall and has an accessible name that says what it fixes ("Fix street address").

### D5. Drafts in the events list

- Draft rows show a **Draft** badge, progress ("2 of 5 ready", same rules and counting as D4), last edited date and time with year, **Continue editing**, and **Delete draft**.
- **Delete draft** opens the existing `ConfirmModal`. The UI shows it only on drafts that were never published (`publishedAt` is null); an event moved back to Draft after going on sale may have registrations. Separately, the server refuses to delete any event that has registrations or orders (A7), so the data is protected even if the UI rule is bypassed.
- **All / Published / Drafts** quick filters (44px buttons) sit beside the existing status filter. The empty state reads "No drafts. Events you start and don't publish yet appear here." with **Create event**.
- The dashboard's **New event** button keeps the existing browser-draft Restore banner for work saved before D1.

### D6. Existing events

Existing events need no migration. Opening any existing event uses the updated editor: existing `draft` events get autosave, published events get Save changes on every step plus the browser backup, and all events get free step navigation and the checklist.

## 5. Screens and states

Each screen is drawn in the wireframes at desktop (1280px) and phone (375px) widths.

| Screen | Loading | Empty | Error | Success |
|---|---|---|---|---|
| Wizard, new event before D1 | n/a (local) | Blank Basics step with placeholders | Browser storage unavailable: "Your browser isn't saving progress. Keep this tab open until the draft is saved to your account." | "Saved on this device" |
| Wizard, draft event | `ScreenSkeleton` (existing) | n/a | `ErrorState` "Couldn't load this event" + **Try again** (existing). Save errors use the D3 states. | "Draft saved · time" |
| Wizard, published event | `ScreenSkeleton` | n/a | Same as draft | "All changes saved" toast + indicator |
| Ready to publish? | Uses loaded data | "Everything's ready." + **Publish event** | Server rejects publish: list shows the server's items. | "Event published" toast, status becomes On sale |
| Events list, Drafts filter | `SkeletonAdminTable` (existing) | EmptyState per D5 | `ErrorState` + **Try again** | Rows as per D5 |

## 6. API contract (for the API gate)

No new endpoints. Changes are to existing `PUT`, `POST` and `DELETE /api/v1/admin/events[/:id]`. Guards are unchanged: `JwtAuthGuard` + `AdminGuard` on the controller, and `assertEventMutationAccess` (platform admin, or organization owner / co-owner / manager with `events.manage`) on update and delete.

**A1. Edit conflict detection (additive, optional field).**
- `UpdateEventDto.expectedUpdatedAt?: string` (`@IsOptional() @IsISO8601()`). Requests without it behave exactly as today.
- Server: validate first, then write with a conditional update inside one transaction: `updateMany({ where: { id, updatedAt: new Date(expectedUpdatedAt) }, data: { ...changes, updatedAt: max(now, expected + 1 ms) } })`. `count === 0` returns **409**; the row is then re-read and returned. Setting `updatedAt` explicitly guarantees every save changes it, even for two saves in the same millisecond or with clock skew between server instances.
- 409 body (fits the existing envelope): `{ success:false, statusCode:409, message:"This event was changed since you opened it. Load the latest version." }`.
- The client stores and sends back the exact `updatedAt` string from the last response.
- Implementation notes (backend gate to confirm): strip `expectedUpdatedAt` from the write data; read the event state that A2 validates inside the same transaction as the conditional write.
- Known limitation: tier endpoints don't change `Event.updatedAt`, so A1 covers event fields only.

**A2. Server-side publish requirements.**
- Runs whenever status changes **from `draft` to any status other than `draft` or `cancelled`** (`on_sale`, `sold_out`, `completed`). This closes the gap where choosing "Sold out" on a draft would make an incomplete event public.
- `UpdateEventDto.status` gets `@IsIn(['draft', 'on_sale', 'sold_out', 'cancelled'])` (today it is any string). `completed` stays server-set by the auto-complete job.
- Checks the D4 list against the resulting event (stored values merged with the request). The tier count is read inside the same transaction as the write.
- Response: **400** `{ success:false, statusCode:400, message:"This event isn't ready to publish.", errors:["Add a cover image.", ...] }`.
- **Envelope change (additive):** today the exception filter keeps `errors` only when `message` is an array, and then replaces the message with "Validation failed". The filter will also pass through an `errors` string array when `message` is a string. Thrown as `new BadRequestException({ message, errors })`. Existing responses are unchanged.
- Existing rules (cover image, payment methods) stay. Edits to already-published events and other status changes are unaffected.
- *Breaking change:* a draft can no longer be published without the full checklist. Consumers that must show `errors` and roll back optimistic status: `apps/web/src/app/admin/page.tsx` (status dropdown, ~L92–107) and `apps/web/src/app/admin/events/[id]/page.tsx` (status mutation ~L327–340, update mutation ~L299–315).

**A3. Audit rows (insert-only).**
- Audit rows stay append-only; nothing updates an existing row.
- While the event is `draft`: insert one `EVENT_DRAFT_SAVED` row per event per user, skipping the insert when such a row already exists within the last 15 minutes (existing `AuditLog` `[entityType, entityId]` index). A rare duplicate from two simultaneous saves is harmless.
- Status transitions and every save to non-draft events keep today's `EVENT_UPDATED` row.
- **All** event update audit rows store changed **field names only**, not values. Today they store full values, including bank and e-wallet account numbers.

**A4. Rate limiting.** Autosave sends at most one request per 2 seconds per tab, only when something changed, and backs off on 429 (D3 retry schedule). Organizers on one office network share `THROTTLE_LIMIT=60`/60s per IP with dashboard polling; the backoff keeps autosave from starving other requests. No limit changes.

**A5. Response shape.** Unchanged. `PUT` returns the updated event including `updatedAt`.

**A6 (skipped, 2026-10-02). Slug refresh before first publish.** Considered and not built: draft preview links on the Event previews page use the slug (`/events/{slug}?preview=1`), so regenerating it would break preview links organizers already shared.

**A7. Safe event deletion.**
- `DELETE /api/v1/admin/events/:id` today deletes the event's registrations, orders and their audit rows before deleting the event.
- New behavior: stop deleting registrations, orders and audit rows. Delete the event in one transaction, together with its reservations (required: reservation foreign keys also block deletion) and any checkout quotes not linked to a registration (their tier foreign key would otherwise block deleting an empty draft), and rely on the existing database rule (`registrations_event_id_fkey` and `orders_event_id_fkey`, `ON DELETE RESTRICT`). A foreign-key refusal (Prisma `P2003`) returns **409** "This event has registrations or orders and can't be deleted. Cancel it instead." Postgres aborts the transaction on that error, so it is caught outside `$transaction` and mapped to the 409 there (otherwise it would surface as a 500). A count check beforehand may give the same message earlier, but the database rule is what makes it race-safe.
- Write an `EVENT_DELETED` audit row (event id and title).
- The UI's `publishedAt` rule (D5) only decides whether the button is shown; the server rule is registrations and orders.
- *Breaking change:* events with registrations or orders can no longer be hard-deleted from any screen. Consumers: `admin/page.tsx` delete (~L110–116) and `admin/events/[id]/page.tsx` delete (~L381–389) must show the 409 message. The new-event rollback deletes in `admin/events/new/page.tsx` (~L237, L251) are unaffected.

**A8. Platform-only fields (existing issue, fixed as a condition).**
On create and update, `platformFee`, `isFeatured`, `featuredOrder` and `featuredUntil` are accepted only from platform admins; for organizers they are ignored. Today an organizer can set the service fee to ₱0, and checkout charges attendees whatever is stored. The fields are **ignored, not rejected**, because the create and edit pages send `platformFee` for every user today (`admin/events/new/page.tsx` ~L144, `admin/events/[id]/page.tsx` handleSubmit); rejecting would break organizers' saves. The Payment step shows organizers the fee read-only; the admin fee save (`admin/events/[id]/page.tsx` ~L318–325) is unaffected. Stored values on existing events are not changed.

## 7. Database (for the DB gate)

No schema change, no migration, no new table, so no RLS work. Uses existing `Event.status` (`draft`), `Event.updatedAt` (`TIMESTAMP(3)`), existing indexes (`Event [organizationId]`, `[status, startsAt]`; `Registration [eventId, status]`; `Order [eventId]`; `AuditLog [entityType, entityId]`), and existing foreign keys (`ON DELETE RESTRICT` from registrations and orders to events). Rollback is code-only with no data loss.

- Autosave costs about four sequential queries per save on the pooled connection; no parallel connections.
- Abandoned drafts remain as small `draft` rows, as today. The auto-complete job doesn't touch drafts. No cleanup job is needed now.

## 8. Accessibility and content checks

- Step status uses icon + text, never color alone. Checked contrast: amber "Needs info" `#92400e` on `#fffbeb` 6.8:1; success `#166534` on `#f0fdf4` 6.8:1; error `#b91c1c` on `#fef2f2` 5.9:1; primary `#7C3AED` on white 5.7:1; muted `#6b5b8a` on white 6.0:1.
- All buttons and step chips are at least 44px tall; visible focus rings use the existing `:focus-visible` outline.
- The save indicator is an `aria-live="polite"` region, so screen readers hear "Draft saved" without stealing focus.
- Buttons say what they do: **Publish event**, **Save changes**, **Continue editing**, **Delete draft**, **Load latest version**, **Restore my changes**.
- Prices use `₱` with thousands separators; dates use "Sat, Aug 15, 2026 · 7:00 PM".

## 9. Delivery plan (after design approval)

Two releases, each through the usual gates:

1. **Release A: navigation, checklist, and existing-risk fixes.**
   - Frontend: free step navigation, non-blocking Next, "Ready to publish?" checklist, mobile step bar and All steps sheet, Save changes on every step for existing events, browser backup and leave-page warning, `ConfirmModal` primary variant and third action. Also, because A7 and A8 ship here: both delete actions show the server's 409 message (`admin/page.tsx` ~L110–116, `admin/events/[id]/page.tsx` ~L381–389), and organizers see the service fee read-only.
   - API (existing issues found in review, independent of drafts): A7 safe deletion, A8 platform-only fields, audit rows with field names only (part of A3), `status` `@IsIn` (part of A2).
2. **Release B: server drafts.** D1 early save, draft autosave, A1 conflict detection, A2 publish checks and the error filter change, A3 draft audit window, D5 drafts in the events list.

Release A fixes "forced to complete all the steps" and closes the fee and deletion risks. Release B fixes "can't save my progress".

## 10. Test plan (to build with the feature)

- **E2E (mocked API, runs in CI):**
  - Jump to any step on a new event.
  - The draft is created exactly when title, venue and dates are valid, and the URL switches to the event without losing the step.
  - Autosave debounce and queuing.
  - Offline shows "Couldn't save", and a retry succeeds. Save and exit while offline stays on the page.
  - A 409 shows the conflict state, and Load latest version plus Restore re-applies only this organizer's changed fields.
  - A refused publish shows the server's `errors` list, from the editor and from the dashboard dropdown.
  - Published events show Save changes on every step, and the leave-page dialog works.
  - The browser backup is restored after a simulated session end.
  - Phone widths: the step bar status text and All steps sheet (focus trap, Escape).
- **API unit tests:**
  - A1: match, mismatch, absent, and two concurrent saves (exactly one wins).
  - A2: each requirement, draft to `sold_out` is blocked, non-draft transitions are unaffected, and invalid `status` values are rejected.
  - Filter: passes through `errors` with a string `message`, and existing validation responses are unchanged.
  - A3: the window skips inserts, rows are insert-only, and metadata holds field names without values.
  - A7: deleting an event with a registration returns 409 (not 500) and deletes nothing; a draft with no registrations deletes, including one with a leftover reservation or checkout quote; an audit row is written.
  - A8: an organizer's `platformFee` and featured fields are ignored, and an admin's are applied.
- **UAT:** golden path 4 (create event, publish, visible on the public listing) and golden path 1 (registration) on an event edited under the new rules.

## 11. Decisions (recorded 2026-10-02, delegated by Ian to Claude's recommendation)

1. Approve D1: save a new event to the account once it has a valid title, venue and dates (no schema change), rather than from the first keystroke (which would need placeholder venue/date values or a schema change).
2. Approve D2: autosave for drafts only; published events keep an explicit Save changes button, now on every step.
3. Approve A2: server-enforced publish checklist on any draft-to-public status change, with the additive error-filter change.
4. Approve A3: append-only audit rows, one draft-save row per event per person per 15 minutes, field names only.
5. A6 slug refresh: skipped (breaks shared draft preview links).
6. Approve A7: events with registrations or orders can't be deleted (cancel them instead).
7. Approve A8: only platform admins can set the service fee and featured placement.
8. Approve the two-release delivery plan (Section 9), with the existing-risk fixes in Release A.
