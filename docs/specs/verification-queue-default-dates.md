# Spec — Verification Queue: no hidden date filter by default

**Date:** 2026-10-06 · **Author:** Claude, decisions by Ian · **Status:** implemented on branch `fix/queue-default-dates`, gates in `docs/signoffs/verification-queue-default-dates.md`.

## 1. Problem
The admin Verification Queue (`apps/web/src/app/admin/verifications/page.tsx`) opened with **Date From** and **Date To** both set to today. The API filters those dates on when the registration was **created** (`RegistrationsService.listPendingVerifications`, `where.createdAt`). So a registration created on an earlier day that is still awaiting review was **hidden by default**: the organizer saw an empty or short list while the "awaiting review" count (not date-filtered) was higher. The only way to see older orders was to notice and press "Clear dates". A customer who registers late one day and finishes the next could wait longer for a ticket because the organizer never saw the order. (The default also used the browser's local date while the API reads the dates as Manila time.)

## 2. Change
1. **No date filter by default.** The queue is "everything awaiting review for the chosen event". The two date inputs start empty and stay available as an optional filter (the "Clear dates" button appears only while a date is set, as before).
2. **Clearer empty state when dates are set:** "Nothing matches these dates. Use "Clear dates" to see every transaction for this event, or adjust the status." Without dates: "Adjust the event or status to see other transactions."
3. **Accessibility fix found while testing:** the Event, Status, Date From, Date To and Search labels were not connected to their inputs. They now use `htmlFor` and `id`, so screen readers announce them.

No API change, no schema change, no new endpoint, no environment variable. The list is paginated (50 per page) and the event selection is still required, so an empty default cannot return an unbounded list.

## 3. Out of scope (noted)
- The queue still requires choosing an event before it lists anything. A cross-event "all awaiting review" view is a separate product decision.
- The queue only lists registrations whose attendee step is complete (`attendeesCompletedAt` set and at least one attendee). That is intentional (see the checkout dead-end release).

## 4. Tests
Playwright (mocked API, `admin-flows.spec.ts`, project `admin-mocked`):
- with no date chosen the request carries `status=pending_approval` and **no** `dateFrom`/`dateTo`, and an order created three days earlier is listed; the date inputs are empty and "Clear dates" is not shown;
- choosing a date still filters (the request carries it, the empty state explains how to clear), and "Clear dates" brings the order back and removes the filter from the request.
Existing admin suites unchanged and green.

## 5. Rollout and rollback
Feature branch -> PR into `uat` -> UAT deploy green -> promotion PR to `main` (Ian merges). Rollback = revert the PR (web only). No migration, no SQL.
