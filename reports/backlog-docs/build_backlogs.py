from __future__ import annotations

from collections import Counter
from html import escape
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs"
MVP_OUT = DOCS / "02-BACKLOG-Axon-Tickets-MVP.html"
DAVI_OUT = DOCS / "14-BACKLOG-Axon-DAVI-NFC-Iteration.html"


STATUS = {
    "verified": ("Verified", "status-verified"),
    "partial": ("Partial", "status-partial"),
    "gap": ("Gap", "status-gap"),
    "deferred": ("Deferred", "status-deferred"),
    "verify": ("Needs verification", "status-verify"),
    "ready": ("Ready", "status-ready"),
    "blocked": ("Blocked", "status-blocked"),
}

EXECUTIVE_STATUS = {
    "verified": ("Working now", "status-verified"),
    "partial": ("Working with limitations", "status-partial"),
    "gap": ("Not yet available", "status-gap"),
    "deferred": ("Planned later", "status-deferred"),
    "verify": ("Confirmation required", "status-verify"),
    "ready": ("Ready to begin", "status-ready"),
    "blocked": ("Waiting on a prerequisite", "status-blocked"),
}

EXECUTIVE_PRIORITY = {
    "Must": "Essential",
    "Should": "Important",
    "Could": "Optional",
    "Wont": "Not in this release",
}

EXECUTIVE_TITLES = {
    "MVP-REG-03": "System-controlled pricing and capacity",
    "MVP-TIX-01": "Tamper-resistant QR tickets",
    "MVP-TIX-05": "QR expiry, replacement and revocation",
    "MVP-CHK-04": "Prevent duplicate check-ins across devices",
    "MVP-DATA-03": "Registration journey tracking",
    "MVP-DATA-04": "Permanent attendance and staff-action history",
    "MVP-NF-01": "Safe data handling and browser protection",
    "MVP-NF-02": "Protection against repeated or abusive requests",
    "MVP-NF-03": "Secure session renewal and logout",
    "MVP-NF-04": "Error monitoring and operational logs",
    "MVP-NF-05": "Automated service health monitoring",
    "MVP-NF-06": "Automated quality checks",
    "MVP-NF-08": "Role-based staff access by event",
    "MVP-NF-09": "Separate test and live environments",
}


def story(
    sid,
    title,
    role,
    want,
    value,
    ac,
    *,
    priority="Must",
    points=3,
    status="verified",
    phase="Current baseline",
    evidence=None,
    depends=None,
    notes=None,
):
    return {
        "id": sid,
        "title": title,
        "role": role,
        "want": want,
        "value": value,
        "ac": ac,
        "priority": priority,
        "points": points,
        "status": status,
        "phase": phase,
        "evidence": evidence or [],
        "depends": depends or [],
        "notes": notes,
    }


MVP_EPICS = [
    {
        "id": "MVP-01",
        "title": "Identity, Access and User Profiles",
        "value": "Attendees and administrators can securely enter the correct experience while Axon protects account and administrative functions.",
        "stories": [
            story("MVP-AUTH-01", "Passwordless email access", "attendee", "request and verify a one-time email code", "I can enter registration without remembering a password",
                  ["GIVEN a valid email, WHEN access is requested, THEN Axon creates or finds the account and sends a six-digit code.",
                   "GIVEN a valid unexpired code, WHEN it is verified, THEN Axon issues access and refresh tokens.",
                   "GIVEN five failed attempts, WHEN another code is submitted, THEN the attempt is blocked and the current code is invalidated."],
                  points=5, evidence=["apps/api/src/auth/auth.service.ts", "apps/web/src/app/auth/access/page.tsx"]),
            story("MVP-AUTH-02", "Admin and organizer email/password authentication", "administrator or organizer", "sign in with my verified email address and password", "I can securely access the administrative functions assigned to my account",
                  ["GIVEN an approved administrator or organizer account, WHEN access is provisioned, THEN the account must have a verified email address and the required administrative permission.",
                   "GIVEN correct credentials for a verified administrator or organizer account, WHEN login succeeds, THEN Axon returns a user session and routes the user to the protected administrative experience.",
                   "GIVEN an ordinary attendee account, WHEN email/password login succeeds, THEN administrative access remains unavailable unless the account has an approved administrative role.",
                   "GIVEN incorrect credentials or an unverified account, WHEN login is attempted, THEN Axon denies administrative access and displays the appropriate verification or credential error."],
                  points=5, status="partial", evidence=["apps/api/src/auth/auth.controller.ts", "apps/api/src/auth/auth.service.ts", "apps/web/src/app/auth/admin/page.tsx"],
                  notes="This email/password login is intended for Admin and Organizer access. Until event-scoped organizer roles are implemented, an organizer must be granted the existing administrative access level to enter the protected management experience."),
            story("MVP-AUTH-03", "Profile management", "authenticated attendee", "view and update my personal profile", "my account details remain current",
                  ["GIVEN an authenticated user, WHEN the profile is opened, THEN Axon returns only that user's profile.",
                   "GIVEN valid updates, WHEN saved, THEN first name, last name, phone, company, job title and city can be updated."],
                  points=3, evidence=["apps/api/src/users/users.controller.ts", "apps/web/src/app/profile/page.tsx"]),
            story("MVP-AUTH-04", "Administrative access control", "platform administrator", "access protected administrative tools", "customer and event data are not exposed to ordinary users",
                  ["GIVEN a non-admin JWT, WHEN an admin endpoint is requested, THEN Axon returns forbidden.",
                   "GIVEN an admin session, WHEN an admin page is opened, THEN the page hydrates the session before rendering protected content."],
                  points=3, status="partial", evidence=["apps/api/src/common/guards/admin.guard.ts", "apps/web/src/app/admin/layout.tsx"],
                  notes="The system currently has only two access levels: Administrator and regular user. Separate Organizer, Support and event-staff permissions are not yet available."),
        ],
    },
    {
        "id": "MVP-02",
        "title": "Event Discovery and Event Configuration",
        "value": "Customers can discover active events while administrators can configure event content, inventory, payment instructions and publication state.",
        "stories": [
            story("MVP-EVT-01", "Public event marketplace", "visitor", "browse events that are currently on sale", "I can discover available experiences",
                  ["GIVEN on-sale events, WHEN the homepage loads, THEN Axon displays event cards ordered for discovery.",
                   "GIVEN pagination, WHEN another page is selected, THEN the corresponding event set is returned.",
                   "GIVEN completed, cancelled or draft events, WHEN public listing is requested, THEN they are excluded from the standard on-sale list."],
                  points=5, evidence=["apps/api/src/events/events.service.ts", "apps/web/src/app/page.tsx"]),
            story("MVP-EVT-02", "Featured event presentation", "visitor", "see promoted events in a prominent hero experience", "important events receive stronger visibility",
                  ["GIVEN featured active events, WHEN the homepage loads, THEN Axon displays them by featured order and event date.",
                   "GIVEN a featured expiry in the past, WHEN featured events are requested, THEN the event is omitted."],
                  points=3, evidence=["apps/api/src/events/events.service.ts", "apps/web/src/components/FeaturedHeroCarousel.tsx"]),
            story("MVP-EVT-03", "Public event details", "visitor", "view event schedule, venue, tickets, speaker, agenda, sponsors and FAQs", "I can decide whether to register",
                  ["GIVEN a valid event slug, WHEN its page opens, THEN Axon shows event content and visible ticket tiers.",
                   "GIVEN live inventory, WHEN tiers are displayed, THEN availability and sold-out state reflect registration and ticket usage."],
                  points=5, evidence=["apps/api/src/events/events.service.ts", "apps/web/src/app/events/[slug]/page.tsx"]),
            story("MVP-EVT-04", "Create and edit events", "administrator", "create and maintain an event", "Axon can operate multiple event campaigns",
                  ["GIVEN valid event details, WHEN an event is created, THEN it starts as a draft with a unique slug.",
                   "GIVEN an existing event, WHEN permitted fields are changed, THEN Axon persists the update and writes an event-update audit entry.",
                   "GIVEN conference content, WHEN configured, THEN agenda, sponsors and FAQs are stored and displayed."],
                  points=8, evidence=["apps/api/src/admin/admin.controller.ts", "apps/web/src/components/event-wizard/WizardShell.tsx"]),
            story("MVP-EVT-05", "Ticket tier management", "administrator", "create, reorder, edit and remove ticket tiers", "pricing and inventory can match each event",
                  ["GIVEN an event, WHEN a tier is created, THEN its name, price, currency, quantity, order limit and sale window are stored.",
                   "GIVEN a tier with sold usage, WHEN deletion is requested, THEN Axon protects linked sales data.",
                   "GIVEN public event retrieval, WHEN tiers are returned, THEN they are ordered and include computed availability."],
                  points=5, evidence=["apps/api/src/ticket-tiers", "apps/web/src/components/event-wizard/TierForm.tsx"]),
            story("MVP-EVT-06", "Payment methods and event media", "administrator", "configure manual payment methods, QR images, covers and sponsor logos", "attendees receive accurate payment and branding information",
                  ["GIVEN a supported image, WHEN uploaded, THEN Cloudinary returns a hosted asset and Axon stores or embeds the URL.",
                   "GIVEN configured payment methods, WHEN registration reaches payment, THEN the relevant instructions and QR image are displayed.",
                   "GIVEN no payment method, WHEN the payment screen opens, THEN the attendee receives a clear organizer-contact message."],
                  points=5, status="partial", evidence=["apps/api/src/upload/upload.service.ts", "apps/web/src/components/event-wizard/steps/PaymentStep.tsx"],
                  notes="Multiple manual payment methods can be configured. Additional file-safety checks are still needed to independently confirm that uploaded images are genuinely the permitted file type."),
        ],
    },
    {
        "id": "MVP-03",
        "title": "Registration and Inventory",
        "value": "Attendees can register individually or in groups while Axon protects capacity, prevents accidental duplicate submissions and maintains a traceable registration lifecycle.",
        "stories": [
            story("MVP-REG-01", "Inline OTP registration journey", "event visitor", "authenticate and register without leaving the event flow", "registration friction is reduced",
                  ["GIVEN an unauthenticated visitor, WHEN registration begins, THEN Axon supports email submission, OTP verification and profile completion inline.",
                   "GIVEN successful verification, WHEN the flow continues, THEN the selected event and registration context are retained."],
                  points=8, evidence=["apps/web/src/app/events/[slug]/register/page.tsx", "apps/api/src/auth/auth.service.ts"]),
            story("MVP-REG-02", "Solo and group registration", "lead registrant", "register one or more named attendees in one transaction", "groups can be processed without separate purchases",
                  ["GIVEN one or more valid attendees, WHEN registration is submitted, THEN one registration and the complete attendee set are created atomically.",
                   "GIVEN a group, WHEN approved, THEN each attendee can receive an individual QR email.",
                   "GIVEN the tier order limit, WHEN the attendee count exceeds it, THEN registration is rejected."],
                  points=8, evidence=["apps/api/src/registrations/registrations.service.ts", "apps/web/src/components/RegistrationForm.tsx"]),
            story("MVP-REG-03", "Server-authoritative price and inventory", "buyer", "receive pricing and availability calculated by Axon", "client manipulation and overselling are prevented",
                  ["GIVEN a selected tier, WHEN registration is created, THEN price, fees and total are calculated from server data.",
                   "GIVEN concurrent requests, WHEN capacity is evaluated, THEN Axon locks the tier row and rejects requests beyond availability.",
                   "GIVEN active registrations, WHEN availability is computed, THEN all capacity-consuming registration states are counted."],
                  points=8, evidence=["apps/api/src/registrations/registrations.service.ts", "apps/api/src/events/events.service.ts"]),
            story("MVP-REG-04", "Duplicate and per-user controls", "attendee", "avoid accidental repeated registrations and ticket-limit violations", "inventory remains fair and understandable",
                  ["GIVEN an active registration for the same user and event, WHEN another registration is submitted, THEN Axon blocks the duplicate attempt.",
                   "GIVEN a configured per-user cap, WHEN a new group would exceed it, THEN Axon rejects the request with the remaining allowance."],
                  points=5, status="partial", evidence=["apps/api/src/registrations/registrations.service.ts", "apps/api/prisma/migrations/20260616120000_unique_active_registration_per_user_event/migration.sql"],
                  notes="The system prevents duplicate registration by account and event. In group registrations, it does not yet check every attendee email against all prior registrations."),
            story("MVP-REG-05", "Registration detail and status", "registrant", "view my registration, attendees, payment instructions and review status", "I understand what happens next",
                  ["GIVEN an authenticated registration owner, WHEN the registration page opens, THEN only their registration is returned.",
                   "GIVEN proof or rejection history, WHEN the page loads, THEN the current status and latest review information are visible."],
                  points=3, evidence=["apps/api/src/registrations/registrations.service.ts", "apps/web/src/app/registrations/[id]/page.tsx"]),
            story("MVP-REG-06", "Edit attendee details before payment", "registrant", "correct attendee information before proof submission", "tickets are issued to accurate identities",
                  ["GIVEN pending_payment status, WHEN the same number of attendee records is submitted, THEN attendee details are updated.",
                   "GIVEN any later registration state, WHEN an edit is attempted, THEN Axon rejects it."],
                  points=3, evidence=["apps/api/src/registrations/registrations.controller.ts", "apps/api/src/registrations/registrations.service.ts"]),
            story("MVP-REG-07", "Cancellation and stale-registration cleanup", "registrant and operations team", "cancel incomplete registrations and release abandoned inventory", "capacity returns to sale safely",
                  ["GIVEN a pending or proof-submitted registration, WHEN the owner cancels it, THEN status changes and tier usage is released.",
                   "GIVEN a pending registration beyond its sale window or abandonment threshold, WHEN the scheduler runs, THEN it is cancelled and inventory is released.",
                   "GIVEN automatic cancellation, WHEN processed, THEN an audit event is written."],
                  points=5, evidence=["apps/api/src/registrations/registrations.service.ts", "apps/api/src/scheduler/scheduler.service.ts"]),
        ],
    },
    {
        "id": "MVP-04",
        "title": "Payments and Verification",
        "value": "Axon supports manual payment instructions, proof submission and organizer verification as the approved MVP payment process.",
        "stories": [
            story("MVP-PAY-01", "Manual payment instruction screen", "registrant", "see the configured transfer options and exact amount", "I can pay correctly",
                  ["GIVEN an owned pending registration, WHEN payment opens, THEN Axon displays amount, event instructions and configured payment methods.",
                   "GIVEN a completed or cancelled state, WHEN the payment route opens, THEN the user is redirected to an appropriate status page."],
                  points=3, evidence=["apps/web/src/app/events/[slug]/register/payment/[registrationId]/page.tsx"]),
            story("MVP-PAY-02", "Payment-proof upload", "registrant", "upload an image of my payment proof", "the organizer can verify my payment",
                  ["GIVEN an owned pending or rejected registration, WHEN a JPG, PNG or WEBP under 5 MB is uploaded, THEN Axon stores the proof and changes status to proof_submitted.",
                   "GIVEN any other registration state, WHEN upload is attempted, THEN Axon rejects it.",
                   "GIVEN a successful upload, WHEN processing completes, THEN an audit and funnel event are created."],
                  points=5, status="partial", evidence=["apps/api/src/payment-proofs/payment-proofs.service.ts", "apps/api/src/payment-proofs/payment-proofs.controller.ts"],
                  notes="File type and size limits are enforced. Stronger file-content checks and private, time-limited access to payment proofs are not yet available."),
            story("MVP-PAY-03", "Verification queue and detail", "administrator", "filter and inspect proof-submitted registrations", "payments can be processed efficiently",
                  ["GIVEN pending verifications, WHEN the queue opens, THEN Axon lists event, buyer, amount, proof state and date.",
                   "GIVEN a selected registration, WHEN detail opens, THEN attendee and proof information are available for review."],
                  points=5, evidence=["apps/api/src/admin/admin.controller.ts", "apps/web/src/app/admin/verifications/page.tsx"]),
            story("MVP-PAY-04", "Approve, reject and bulk review", "administrator", "approve or reject payment evidence individually or in controlled batches", "attendee eligibility is established",
                  ["GIVEN proof_submitted status, WHEN approved, THEN registration and latest proof become approved/verified and QR tokens are created.",
                   "GIVEN rejection with a valid reason, WHEN processed, THEN registration and proof are rejected and the reason is stored.",
                   "GIVEN up to 20 IDs, WHEN bulk action runs, THEN Axon reports success or error per registration."],
                  points=8, evidence=["apps/api/src/registrations/registrations.service.ts", "apps/web/src/app/admin/verifications/page.tsx"]),
            story("MVP-PAY-05", "Payment-proof privacy", "attendee", "have my financial screenshot protected from public access", "sensitive payment data is not exposed",
                  ["GIVEN a proof image, WHEN stored, THEN it should not be anonymously retrievable.",
                   "GIVEN an authorized administrator, WHEN proof review is requested, THEN access should be short-lived and auditable."],
                  points=5, status="gap", phase="Production hardening", evidence=["apps/api/src/upload/upload.service.ts", "apps/api/src/registrations/registrations.service.ts"],
                  notes="Payment proofs are stored with the upload provider and shown only in authenticated views, but the files are not yet protected by private, time-limited viewing links."),
        ],
    },
    {
        "id": "MVP-05",
        "title": "Tickets, QR and Notifications",
        "value": "Verified attendees receive individual signed credentials and can retrieve them from their account or email.",
        "stories": [
            story("MVP-TIX-01", "Signed QR credential generation", "verified attendee", "receive a tamper-resistant event credential", "my ticket can be validated at the venue",
                  ["GIVEN registration approval, WHEN attendee QR tokens are missing, THEN Axon creates one HMAC-signed token per attendee.",
                   "GIVEN a modified token, WHEN validation occurs, THEN signature verification fails."],
                  points=5, evidence=["packages/utils/src/qr.ts", "apps/api/src/registrations/registrations.service.ts"]),
            story("MVP-TIX-02", "Individual ticket email delivery", "attendee", "receive my own QR code by email", "I can arrive without depending on the lead registrant",
                  ["GIVEN a verified group registration, WHEN QR delivery runs, THEN each attendee receives a message at their own email address.",
                   "GIVEN one failed address, WHEN group delivery runs, THEN other attendee emails continue and the failure is logged."],
                  points=5, evidence=["apps/api/src/registrations/registrations.service.ts", "apps/api/src/email/email.service.ts"]),
            story("MVP-TIX-03", "My Tickets experience", "authenticated registrant", "see my approved registration tickets in one place", "I can retrieve every credential issued through the approved registration flow",
                  ["GIVEN approved registration tickets, WHEN My Tickets loads, THEN the attendee credentials are displayed consistently.",
                   "GIVEN a registration attendee ticket, WHEN its detail opens, THEN the correct attendee and event information is shown."],
                  points=5, evidence=["apps/api/src/tickets/tickets.service.ts", "apps/web/src/app/account/tickets/page.tsx"]),
            story("MVP-TIX-04", "Administrative resend", "administrator", "resend a verified registration ticket", "delivery problems can be resolved",
                  ["GIVEN a verified registration, WHEN resend is requested, THEN Axon sends the attendee QR email and writes an audit entry."],
                  points=3, evidence=["apps/api/src/admin/admin.controller.ts", "apps/api/src/registrations/registrations.service.ts"]),
            story("MVP-TIX-05", "Credential lifecycle hardening", "security owner", "expire, rotate and revoke QR credentials predictably", "copied or stale credentials have bounded risk",
                  ["GIVEN a QR token, WHEN parsed, THEN it should include key version and issuance/expiry context.",
                   "GIVEN a revoked or replaced credential, WHEN scanned, THEN Axon should reject it without deleting audit history."],
                  points=5, status="gap", phase="Post-MVP hardening", evidence=["packages/utils/src/qr.ts"],
                  notes="QR tickets are protected against alteration, but they do not yet have a built-in expiry, controlled key version, or a formal way to revoke and replace one credential."),
        ],
    },
    {
        "id": "MVP-06",
        "title": "Attendance and Event-Day Operations",
        "value": "Event staff can admit valid attendees using QR or manual lookup while Axon records attendance.",
        "stories": [
            story("MVP-CHK-01", "Browser camera QR scanner", "event administrator", "scan attendee QR codes with a phone camera", "the entrance queue moves quickly",
                  ["GIVEN an active selected event and camera permission, WHEN a QR is visible, THEN the browser decodes it and submits it once.",
                   "GIVEN repeated frames, WHEN the same QR remains visible, THEN the UI applies a scan lock and cooldown."],
                  points=5, evidence=["apps/web/src/app/admin/checkin/page.tsx"]),
            story("MVP-CHK-02", "Server-side QR validation", "event staff", "validate the token, event and payment state", "only eligible attendees enter",
                  ["GIVEN an attendee QR, WHEN scanned, THEN token fields must match the attendee, registration and selected event.",
                   "GIVEN an unverified registration or invalid attendee credential, WHEN scanned, THEN Axon rejects entry."],
                  points=5, evidence=["apps/api/src/admin/admin.service.ts"]),
            story("MVP-CHK-03", "Manual search and check-in", "event staff", "find an attendee by name, email or reference", "lost or unreadable QR codes do not stop admission",
                  ["GIVEN a selected event, WHEN staff searches, THEN Axon returns matching attendees and current check-in state.",
                   "GIVEN a verified unchecked attendee, WHEN manual check-in is confirmed, THEN attendance and audit data are written."],
                  points=3, evidence=["apps/api/src/admin/admin.service.ts", "apps/web/src/app/admin/checkin/page.tsx"]),
            story("MVP-CHK-04", "Atomic duplicate prevention", "event operator", "ensure simultaneous scans cannot admit the same attendee twice", "attendance data remains trustworthy",
                  ["GIVEN two concurrent scans for one attendee, WHEN both reach the database, THEN only one accepted check-in may be created.",
                   "GIVEN the losing request, WHEN returned, THEN it shows the original successful check-in time."],
                  points=5, status="verified", phase="Current baseline", evidence=["apps/api/src/admin/admin.service.ts"],
                  notes="The current process prevents two devices from successfully checking in the same attendee at the same time. A permanent, event-by-event attendance history is still listed separately as future work."),
        ],
    },
    {
        "id": "MVP-07",
        "title": "Administrative Operations",
        "value": "Administrators can manage events, transactions, attendees, users and operational outputs from a centralized control surface.",
        "stories": [
            story("MVP-ADM-01", "Admin dashboard and navigation", "administrator", "see platform totals and reach operational tools", "I can run Axon from one control surface",
                  ["GIVEN an admin session, WHEN the dashboard opens, THEN Axon displays revenue/ticket metrics, recent events and quick links.",
                   "GIVEN event status change, WHEN saved, THEN the dashboard updates and rolls back optimistic state on failure."],
                  points=5, evidence=["apps/web/src/app/admin/page.tsx"]),
            story("MVP-ADM-02", "Registration transaction monitoring", "administrator", "review manual-payment registrations in one operational view", "financial operations are easier to reconcile",
                  ["GIVEN registrations, WHEN transactions are listed, THEN Axon presents them in one sortable result.",
                   "GIVEN export, WHEN requested, THEN Axon creates CSV output with formula-injection protection."],
                  points=5, evidence=["apps/api/src/admin/admin.service.ts", "apps/web/src/app/admin/orders/page.tsx"]),
            story("MVP-ADM-03", "Attendee management and exports", "administrator", "search attendees and export event rosters", "event operations have a reliable working list",
                  ["GIVEN an event, WHEN attendees are requested, THEN verified registration attendees are returned.",
                   "GIVEN CSV export, WHEN downloaded, THEN attendee, tier, payment and attendance fields are included."],
                  points=5, evidence=["apps/api/src/admin/admin.service.ts", "apps/web/src/app/admin/attendees/page.tsx"]),
            story("MVP-ADM-04", "Printable nametags", "event administrator", "generate selected attendee nametags as PDF", "venue preparation is faster",
                  ["GIVEN an event and optional attendee IDs, WHEN requested, THEN Axon returns a printable PDF for eligible records.",
                   "GIVEN invalid attendee IDs or no eligible records, WHEN processed, THEN Axon returns a clear error."],
                  points=3, evidence=["apps/api/src/admin/admin.controller.ts", "apps/api/src/admin/admin.service.ts"]),
            story("MVP-ADM-05", "User and admin-role management", "administrator", "grant or remove administrator access", "platform access can be maintained",
                  ["GIVEN an existing user, WHEN role is changed, THEN isAdmin is updated.",
                   "GIVEN the current caller, WHEN attempting to change their own role, THEN Axon blocks the action."],
                  points=3, status="partial", evidence=["apps/api/src/admin/admin.service.ts", "apps/web/src/app/admin/users/page.tsx"],
                  notes="Access is currently Administrator or regular user only. Separate permissions for organizers, payment reviewers, support staff and check-in staff are not yet available."),
            story("MVP-ADM-06", "Fraud-flag visibility", "administrator", "view and resolve fraud flags", "suspicious activity can be reviewed",
                  ["GIVEN unresolved flags, WHEN the page/API is requested, THEN Axon returns user/order context.",
                   "GIVEN a reviewed flag, WHEN resolved, THEN resolvedAt is stored."],
                  points=3, status="partial", evidence=["apps/api/src/admin/admin.controller.ts", "apps/api/src/admin/admin.service.ts"],
                  notes="Basic fraud-flag handling exists behind the scenes. The business rules and the complete administrator screen still need confirmation."),
        ],
    },
    {
        "id": "MVP-08",
        "title": "Analytics, Funnel and Reporting",
        "value": "Axon provides event, revenue, conversion and attendance information for operational decisions.",
        "stories": [
            story("MVP-DATA-01", "Event sales and attendance analytics", "administrator", "see registrations, revenue, capacity and check-in performance", "I can understand event health",
                  ["GIVEN an event, WHEN analytics loads, THEN totals reflect verified registrations and recorded attendance.",
                   "GIVEN tier inventory, WHEN reported, THEN sold, available, revenue and fill rate are shown."],
                  points=5, evidence=["apps/api/src/admin/admin.service.ts", "apps/web/src/app/admin/analytics/page.tsx"]),
            story("MVP-DATA-02", "Revenue timeline", "administrator", "view daily sales and revenue", "I can understand momentum over time",
                  ["GIVEN a valid event and day range, WHEN requested, THEN Axon returns one row per day for the approved manual-payment registration path.",
                   "GIVEN an unsupported range, WHEN requested, THEN Axon constrains it to a safe maximum."],
                  points=3, evidence=["apps/api/src/admin/admin.service.ts"]),
            story("MVP-DATA-03", "Registration funnel tracking", "product operator", "measure major registration steps and failures", "conversion problems can be identified",
                  ["GIVEN customer progress, WHEN tracked, THEN Axon stores event, session, user, step, status and safe metadata.",
                   "GIVEN an event, WHEN funnel analytics loads, THEN counts and recent failures are returned."],
                  points=5, evidence=["apps/api/src/funnel", "apps/web/src/lib/funnel.ts"]),
            story("MVP-DATA-04", "Immutable operational reporting model", "operations and audit owner", "report from append-only check-in and staff-action events", "historical changes remain explainable",
                  ["GIVEN a check-in, override or operational correction, WHEN recorded, THEN an event entry should be retained instead of only overwriting current state.",
                   "GIVEN reporting, WHEN totals are calculated, THEN the accepted authoritative event is distinguishable from rejected attempts."],
                  points=8, status="gap", phase="Required for DAVI/NFC iteration", evidence=["apps/api/prisma/schema.prisma"],
                  notes="The system records current attendance and general activity logs, but it does not yet preserve every check-in attempt and correction as a permanent, unchangeable history."),
        ],
    },
    {
        "id": "MVP-09",
        "title": "Platform Reliability, Security and Quality",
        "value": "The system remains secure, observable and supportable as it moves from MVP into recurring production event operations.",
        "stories": [
            story("MVP-NF-01", "Strict request validation and security headers", "security owner", "reject unexpected payloads and apply browser security headers", "the API has safe defaults",
                  ["GIVEN an unknown DTO field, WHEN submitted, THEN the API rejects it.",
                   "GIVEN an API response, WHEN returned, THEN Helmet and configured CORS protections are applied."],
                  points=3, evidence=["apps/api/src/main.ts"]),
            story("MVP-NF-02", "Rate limiting and OTP abuse controls", "security owner", "limit high-risk requests", "email abuse and brute-force attempts are constrained",
                  ["GIVEN repeated requests from one trusted proxy IP, WHEN limits are exceeded, THEN Axon throttles the caller.",
                   "GIVEN OTP verification failures, WHEN five attempts occur, THEN further attempts are blocked.",
                   "GIVEN one IP, WHEN hourly OTP sends exceed the configured ceiling, THEN Axon throttles them."],
                  points=5, evidence=["apps/api/src/app.module.ts", "apps/api/src/common/guards/throttler.guard.ts"]),
            story("MVP-NF-03", "JWT and refresh-token rotation", "authenticated user", "maintain a revocable session", "stolen or expired sessions have bounded use",
                  ["GIVEN a valid refresh token, WHEN refreshed, THEN the old token is revoked and a new pair is issued.",
                   "GIVEN logout, WHEN completed, THEN the refresh-token record is removed."],
                  points=5, status="partial", evidence=["apps/api/src/auth/auth.service.ts", "apps/web/src/lib/auth.ts"],
                  notes="Sessions can be renewed and cancelled, but one browser-held session credential should be moved to a more protected storage method."),
            story("MVP-NF-04", "Structured logging and Sentry", "technical operator", "capture production errors and searchable operational logs", "incidents can be diagnosed",
                  ["GIVEN production errors, WHEN unhandled, THEN the API/web integrations can submit them to Sentry when configured.",
                   "GIVEN HTTP requests, WHEN logged, THEN authorization and cookie headers are redacted."],
                  points=3, status="verify", evidence=["apps/api/src/main.ts", "apps/web/src/instrumentation-client.ts"],
                  notes="Error monitoring is built into the system. The live connection, alert recipients and data-retention settings still need to be confirmed."),
            story("MVP-NF-05", "Health checks", "operations monitor", "check database and Redis availability", "external monitoring can detect outages",
                  ["GIVEN healthy dependencies, WHEN /health is requested, THEN Axon reports database and Redis health.",
                   "GIVEN a failed dependency, WHEN checked, THEN the unhealthy state is surfaced."],
                  points=2, evidence=["apps/api/src/health/health.service.ts"]),
            story("MVP-NF-06", "Automated test baseline", "development team", "run repeatable API and browser-flow tests", "regressions are detected before release",
                  ["GIVEN the API test command, WHEN run, THEN unit suites for authentication, tickets, featured events and QR tokens pass.",
                   "GIVEN Playwright configuration and credentials, WHEN E2E tests run, THEN public and admin smoke flows are exercised."],
                  points=5, status="partial", evidence=["apps/api/src/**/*.spec.ts", "apps/web/e2e"],
                  notes="The available automated checks pass, although some are duplicated. Full testing of the complete registration-to-check-in journey and simultaneous-user scenarios is still incomplete."),
            story("MVP-NF-07", "Accessibility and mobile quality gate", "attendee", "use registration and ticket pages on mobile and assistive technology", "the experience is inclusive",
                  ["GIVEN supported mobile widths, WHEN attendee pages are used, THEN no critical interaction requires desktop layout.",
                   "GIVEN keyboard and screen-reader use, WHEN forms are completed, THEN labels, errors and focus behavior should meet WCAG AA."],
                  points=5, status="verify", evidence=["apps/web/src", "apps/web/e2e"],
                  notes="The system is designed for mobile screens. A formal accessibility review and a documented list of tested phones, tablets and browsers are still required."),
            story("MVP-NF-08", "Event-scoped role-based access", "platform owner", "assign least-privilege organizer, reviewer, support and event-staff roles", "operational users do not receive full platform administration",
                  ["GIVEN an event-staff account, WHEN authenticated, THEN it can access only assigned event check-in functions.",
                   "GIVEN a payment reviewer, WHEN authenticated, THEN it cannot create users or delete events.",
                   "GIVEN role changes, WHEN made, THEN they are audited and enforced server-side."],
                  points=8, status="gap", phase="Required before kiosk rollout", evidence=["apps/api/prisma/schema.prisma", "apps/api/src/common/guards/admin.guard.ts"],
                  notes="The system currently provides full Administrator access or regular-user access only; limited event-specific roles are not yet available."),
            story("MVP-NF-09", "Environment isolation and controlled release", "platform owner", "separate UAT from Production and require evidence before promotion", "test activity cannot silently affect live customers or data",
                  ["GIVEN the UAT environment, WHEN it starts and operates, THEN it uses UAT domains, database, Redis, upload folders, email controls and environment markers.",
                   "GIVEN a change to main or uat, WHEN CI runs, THEN lint, type-check, builds and Prisma validation must complete.",
                   "GIVEN a Production promotion, WHEN approval is requested, THEN a completed UAT record, rollback plan and recovery evidence should be available."],
                  points=5, status="partial", phase="Production readiness", evidence=["docs/environment-matrix.md", "docs/UAT-SIGN-OFF-TEMPLATE.md", ".github/workflows/test-and-build.yml", ".github/workflows/deploy-uat.yml", "apps/api/src/main.ts", "apps/api/src/config/configuration.ts"],
                  notes="A separate protected test environment and automated release checks are in place. Formal approval before a live release, a completed recovery rehearsal and a signed business test record remain open."),
        ],
    },
]


DAVI_EPICS = [
    {
        "id": "DAVI-00",
        "title": "Discovery, Repository and Device Validation",
        "value": "Prove that the contributed kiosk technology and real NFC cards work on the exact July devices before Axon commits to implementation.",
        "stories": [
            story("DAVI-DISC-01", "Receive and build the kiosk repository", "technical lead", "obtain, build and run the Davi-provided NFC kiosk repository", "the team understands the real starting point",
                  ["GIVEN repository access and setup instructions, WHEN the documented build is run, THEN the kiosk launches without undocumented manual patches.",
                   "GIVEN the running application, WHEN network activity is inspected, THEN every Davi/external dependency is documented.",
                   "GIVEN build failure, WHEN discovery ends, THEN the blocker, owner and required Davi action are recorded."],
                  priority="Must", points=3, status="blocked", phase="Discovery", depends=["Repository access from Davi/Dotside"],
                  notes="Greatest-value first story. No downstream NFC commitment should be made before this succeeds."),
            story("DAVI-DISC-02", "Identify the card protocol and identifier", "integration architect", "determine exactly what the kiosk reads from each card", "Axon can design a stable and secure card mapping",
                  ["GIVEN a production card, WHEN scanned repeatedly, THEN the returned identifier and protocol are captured and consistent.",
                   "GIVEN multiple cards, WHEN scanned, THEN identifiers are unique at the expected collision risk.",
                   "GIVEN UID, NDEF or proprietary data, WHEN identified, THEN cloning, rewriting and privacy implications are documented."],
                  priority="Must", points=5, status="blocked", phase="Discovery", depends=["DAVI-DISC-01", "Production NFC cards"]),
            story("DAVI-DISC-03", "Approve the July kiosk device matrix", "event technology lead", "test the exact phone, operating system and app/browser combinations", "production does not depend on assumed NFC support",
                  ["GIVEN each proposed device, WHEN the real card is scanned 20 consecutive times, THEN success/failure rate and median read time are recorded.",
                   "GIVEN a browser-based Web NFC kiosk, WHEN tested, THEN Android Chrome, HTTPS, foreground and permission requirements are confirmed.",
                   "GIVEN iPhone use, WHEN proposed, THEN a native Core NFC implementation or supported reader is demonstrated; Safari Web NFC is not assumed."],
                  priority="Must", points=5, status="blocked", phase="Discovery", depends=["DAVI-DISC-01", "DAVI-DISC-02"]),
            story("DAVI-DISC-04", "Document the existing kiosk architecture", "developer", "map screens, local storage, APIs, authentication and offline behavior", "the adaptation work is estimable",
                  ["GIVEN the repository, WHEN reviewed, THEN a component/data-flow diagram is produced.",
                   "GIVEN local persistence, WHEN present, THEN stored fields, encryption and expiry are documented.",
                   "GIVEN Davi production calls, WHEN found, THEN each is classified as remove, replace, retain outside live operations, or needs decision."],
                  priority="Must", points=3, status="blocked", phase="Discovery", depends=["DAVI-DISC-01"]),
            story("DAVI-DISC-05", "Freeze check-in and freebie business rules", "product owner", "approve eligibility, duplicate, replacement and override rules", "developers implement one unambiguous behavior",
                  ["GIVEN registration states, WHEN rules are approved, THEN every state has an explicit check-in decision.",
                   "GIVEN each July freebie, WHEN rules are approved, THEN eligible tiers, quantity, variants, reversal and override behavior are documented.",
                   "GIVEN re-entry or repeat taps, WHEN rules are approved, THEN the intended result and displayed message are defined."],
                  priority="Must", points=3, status="ready", phase="Discovery"),
            story("DAVI-DISC-06", "Approve the July scope box and release gate", "product owner", "separate must-have pilot work from post-July enhancements", "scope remains achievable and reliable",
                  ["GIVEN the discovery results, WHEN scope is approved, THEN NFC check-in, fallback, security and one controlled freebie pilot are explicitly included or excluded.",
                   "GIVEN any new request, WHEN raised after scope freeze, THEN it replaces an item of equivalent effort or moves after July.",
                   "GIVEN a failed discovery gate, WHEN reviewed, THEN QR-only operation remains the approved fallback."],
                  priority="Must", points=2, status="ready", phase="Discovery", depends=["DAVI-DISC-01", "DAVI-DISC-02", "DAVI-DISC-03"]),
        ],
    },
    {
        "id": "DAVI-01",
        "title": "NFC Card Identity and Lifecycle",
        "value": "Axon can safely link a physical card to an attendee while preserving assignment history, replacement and revocation.",
        "stories": [
            story("DAVI-CARD-01", "Design NFC card records", "system owner", "store a safe card token and lifecycle state", "the physical credential can be managed without storing PII on the card",
                  ["GIVEN a card, WHEN registered, THEN Axon stores an internal ID, token/token hash, protocol/type, status and timestamps.",
                   "GIVEN the database design, WHEN reviewed, THEN no attendee name, email, payment details or entitlement list is required on the NFC card.",
                   "GIVEN sensitive raw card values, WHEN stored, THEN hashing/encryption requirements are explicitly decided."],
                  priority="Must", points=3, status="blocked", phase="July MVP", depends=["DAVI-DISC-02"]),
            story("DAVI-CARD-02", "Design attendee-card assignment history", "operations administrator", "link cards to attendees without losing replacement history", "lost and reassigned cards remain explainable",
                  ["GIVEN a card assignment, WHEN created, THEN attendee, event scope, assigner, time and active state are recorded.",
                   "GIVEN one active card, WHEN assigned to another attendee, THEN Axon blocks silent reassignment.",
                   "GIVEN an attendee with an active card, WHEN a replacement is issued, THEN the previous assignment is deactivated and retained."],
                  priority="Must", points=5, status="blocked", phase="July MVP", depends=["DAVI-CARD-01"]),
            story("DAVI-CARD-03", "Assign a card to a verified attendee", "authorized event staff", "search an attendee and tap a card to assign it", "the card can identify the correct person at the event",
                  ["GIVEN a verified attendee without an active card, WHEN staff confirms a scanned unused card, THEN assignment succeeds.",
                   "GIVEN an unverified attendee, WHEN assignment is attempted, THEN it is rejected unless the approved rule explicitly permits pre-assignment.",
                   "GIVEN success or rejection, WHEN completed, THEN the actor, station, reason and time are audited."],
                  priority="Must", points=5, status="blocked", phase="July MVP", depends=["DAVI-CARD-02", "DAVI-STN-03"]),
            story("DAVI-CARD-04", "Replace a lost or damaged card", "authorized support staff", "revoke the old card and issue a replacement", "the attendee can continue without duplicate active credentials",
                  ["GIVEN a reported lost card, WHEN replacement is confirmed, THEN the old card becomes revoked before the new card becomes active.",
                   "GIVEN the old card, WHEN later tapped, THEN Axon returns card revoked and does not perform the event action.",
                   "GIVEN replacement, WHEN complete, THEN the reason and staff identity are retained."],
                  priority="Must", points=3, status="blocked", phase="July MVP", depends=["DAVI-CARD-03"]),
            story("DAVI-CARD-05", "Search and reconcile card assignments", "event support lead", "find cards by attendee, token reference or assignment state", "unlinked and duplicate operational cases can be resolved",
                  ["GIVEN an attendee or safe card reference, WHEN searched, THEN authorized staff can view current and prior assignments.",
                   "GIVEN unassigned or revoked cards, WHEN filtered, THEN the support team can export an exception list."],
                  priority="Should", points=3, status="blocked", phase="After July", depends=["DAVI-CARD-02"]),
        ],
    },
    {
        "id": "DAVI-02",
        "title": "Kiosk Identity, Authorization and Security",
        "value": "Kiosk devices receive only the permissions needed for their assigned event and station.",
        "stories": [
            story("DAVI-STN-01", "Model event stations", "event administrator", "register entrance, freebie and support stations", "every operation has a known physical and technical origin",
                  ["GIVEN a station, WHEN created, THEN event, station type, display name, device reference and active state are stored.",
                   "GIVEN a station type, WHEN permissions are evaluated, THEN only approved actions are allowed."],
                  priority="Must", points=3, status="ready", phase="July MVP"),
            story("DAVI-STN-02", "Issue short-lived kiosk credentials", "security owner", "authenticate each registered kiosk independently", "a copied or lost credential has limited use",
                  ["GIVEN an approved device, WHEN activated, THEN Axon issues event- and station-scoped credentials.",
                   "GIVEN an expired or revoked credential, WHEN an operation is submitted, THEN Axon rejects it.",
                   "GIVEN source code review, WHEN completed, THEN production secrets are not hard-coded in the kiosk repository."],
                  priority="Must", points=5, status="ready", phase="July MVP", depends=["DAVI-STN-01"]),
            story("DAVI-STN-03", "Enforce least-privilege station permissions", "platform owner", "restrict stations to check-in, assignment or freebie actions", "a kiosk cannot access full administration",
                  ["GIVEN an entrance station, WHEN it requests user management or event deletion, THEN access is forbidden.",
                   "GIVEN a freebie station, WHEN it attempts card assignment without permission, THEN access is forbidden.",
                   "GIVEN permissions, WHEN enforced, THEN checks occur on the API, not only in the interface."],
                  priority="Must", points=5, status="ready", phase="July MVP", depends=["DAVI-STN-02"]),
            story("DAVI-STN-04", "Remotely revoke a kiosk", "incident commander", "disable a lost or compromised device", "event operations can contain security incidents",
                  ["GIVEN an active station, WHEN revoked, THEN new online operations are rejected immediately.",
                   "GIVEN queued offline actions from a revoked device, WHEN synchronized, THEN they are quarantined for review."],
                  priority="Must", points=3, status="ready", phase="July MVP", depends=["DAVI-STN-02"]),
            story("DAVI-STN-05", "Protect local kiosk data", "security owner", "encrypt and expire cached event information", "device loss does not expose unnecessary attendee data",
                  ["GIVEN locally cached attendee/card data, WHEN stored, THEN it is encrypted using platform-appropriate secure storage.",
                   "GIVEN event completion or cache expiry, WHEN cleanup runs, THEN local data and credentials are removed.",
                   "GIVEN the minimum dataset, WHEN reviewed, THEN payment proofs, bank details, auth secrets and unnecessary PII are absent."],
                  priority="Must", points=5, status="blocked", phase="July MVP", depends=["DAVI-DISC-04", "DAVI-OFF-01"]),
        ],
    },
    {
        "id": "DAVI-03",
        "title": "Axon-Authoritative NFC Check-In",
        "value": "A card tap becomes a fast Axon check-in while preserving the existing QR and manual pathways.",
        "stories": [
            story("DAVI-CHK-01", "Create an immutable check-in event model", "operations owner", "record every accepted, duplicate, rejected and overridden attempt", "attendance decisions remain auditable",
                  ["GIVEN a check-in attempt, WHEN processed, THEN attendee, event, method, result, station, actor/device, operation ID and timestamps are stored.",
                   "GIVEN a correction or override, WHEN processed, THEN the original event remains unchanged and a new event explains the change."],
                  priority="Must", points=5, status="ready", phase="July MVP"),
            story("DAVI-CHK-02", "Make accepted check-in atomic", "event operator", "allow only one accepted check-in per attendee and event", "simultaneous stations cannot create conflicting attendance",
                  ["GIVEN two concurrent first attempts, WHEN committed, THEN exactly one is accepted.",
                   "GIVEN the second attempt, WHEN returned, THEN it reports already checked in with the authoritative time.",
                   "GIVEN retries with one operation ID, WHEN repeated, THEN the original result is returned."],
                  priority="Must", points=8, status="ready", phase="July MVP", depends=["DAVI-CHK-01"]),
            story("DAVI-CHK-03", "Resolve an NFC card to an eligible attendee", "entrance kiosk", "submit a card token and selected event", "Axon can apply its registration and ticket rules",
                  ["GIVEN an active assigned card, WHEN submitted, THEN Axon resolves the attendee without returning unnecessary PII.",
                   "GIVEN unknown, revoked, replaced or wrong-event cards, WHEN submitted, THEN Axon returns a clear business result.",
                   "GIVEN a Davi outage, WHEN the Axon API is available, THEN the online transaction still completes."],
                  priority="Must", points=5, status="blocked", phase="July MVP", depends=["DAVI-CARD-02", "DAVI-STN-03"]),
            story("DAVI-CHK-04", "Apply existing Axon eligibility rules", "entrance staff", "validate event, payment and ticket state after a card tap", "NFC does not weaken admission controls",
                  ["GIVEN verified registration or paid valid ticket according to approved rules, WHEN tapped, THEN check-in may proceed.",
                   "GIVEN cancelled, rejected, refunded or wrong-event state, WHEN tapped, THEN Axon rejects the action.",
                   "GIVEN rule results, WHEN returned, THEN the kiosk displays a plain-language message."],
                  priority="Must", points=5, status="ready", phase="July MVP", depends=["DAVI-DISC-05", "DAVI-CHK-03"]),
            story("DAVI-CHK-05", "Expose the NFC check-in API", "kiosk application", "submit event, card, station and unique operation context", "the kiosk can safely retry and receive a deterministic result",
                  ["GIVEN a valid station request, WHEN POST /event-operations/check-ins/nfc is called, THEN Axon returns checked_in, already_checked_in or a documented rejection code.",
                   "GIVEN the same operation ID, WHEN retried, THEN no additional event is created.",
                   "GIVEN invalid station scope, WHEN submitted, THEN access is forbidden and logged."],
                  priority="Must", points=5, status="ready", phase="July MVP", depends=["DAVI-CHK-02", "DAVI-CHK-03", "DAVI-CHK-04"]),
            story("DAVI-CHK-06", "Preserve QR and manual fallback", "event staff", "switch from NFC to existing admission methods", "hardware or card failure does not stop the event",
                  ["GIVEN an unreadable or unlinked card, WHEN support is required, THEN staff can scan the existing Axon QR or search the attendee.",
                   "GIVEN any method, WHEN attendance succeeds, THEN the same authoritative check-in ledger is used.",
                   "GIVEN a prior NFC check-in, WHEN QR is scanned, THEN the duplicate result is shown."],
                  priority="Must", points=5, status="ready", phase="July MVP", depends=["DAVI-CHK-01", "DAVI-CHK-02"]),
            story("DAVI-CHK-07", "Check-in operations dashboard", "event lead", "monitor station health, check-ins, duplicates and exceptions", "issues can be handled before queues grow",
                  ["GIVEN active stations, WHEN dashboard data refreshes, THEN last activity, success count, rejection count and offline queue state are visible.",
                   "GIVEN an exception spike, WHEN thresholds are exceeded, THEN the operational lead can identify the station and reason."],
                  priority="Should", points=8, status="ready", phase="After July", depends=["DAVI-CHK-01", "DAVI-STN-01"]),
        ],
    },
    {
        "id": "DAVI-04",
        "title": "Axon Freebie Entitlements and Collection",
        "value": "Axon determines who may receive each physical item and prevents duplicate collection.",
        "stories": [
            story("DAVI-FRB-01", "Define event freebies", "event administrator", "configure a freebie, stock and optional variants", "the station knows what may be released",
                  ["GIVEN an event, WHEN a freebie is created, THEN name, description, active period, stock quantity and optional variants are stored.",
                   "GIVEN an inactive freebie, WHEN scanned, THEN no new collection is accepted."],
                  priority="Must", points=3, status="ready", phase="July MVP"),
            story("DAVI-FRB-02", "Assign attendee entitlements", "event administrator", "grant freebies by event, tier or explicit attendee", "eligibility is consistent and reviewable",
                  ["GIVEN an approved tier rule, WHEN entitlements are generated, THEN eligible attendees receive the configured quantity.",
                   "GIVEN an explicit exception, WHEN added, THEN the source and actor are recorded.",
                   "GIVEN no entitlement, WHEN validation occurs, THEN the result is not eligible."],
                  priority="Must", points=5, status="ready", phase="July MVP", depends=["DAVI-FRB-01", "DAVI-DISC-05"]),
            story("DAVI-FRB-03", "Validate a freebie before handover", "freebie station", "tap a card and see eligibility and prior collection", "staff can make the correct decision before releasing stock",
                  ["GIVEN an active card and entitlement, WHEN validated, THEN the kiosk shows item, variant, allowance and prior claim state.",
                   "GIVEN an ineligible or unknown card, WHEN validated, THEN no collection is created."],
                  priority="Must", points=5, status="blocked", phase="July MVP", depends=["DAVI-CARD-02", "DAVI-FRB-02", "DAVI-STN-03"]),
            story("DAVI-FRB-04", "Require staff confirmation of physical handover", "freebie staff member", "confirm that the item was actually given", "a mere card tap does not consume stock",
                  ["GIVEN a successful validation, WHEN the screen appears, THEN collection is not recorded until staff confirms handover.",
                   "GIVEN cancellation or timeout, WHEN no confirmation occurs, THEN the entitlement remains unused."],
                  priority="Must", points=3, status="ready", phase="July MVP", depends=["DAVI-FRB-03"]),
            story("DAVI-FRB-05", "Prevent duplicate freebie collection atomically", "event owner", "allow only the entitled quantity", "two stations cannot release the same limited item twice",
                  ["GIVEN quantity one, WHEN two stations confirm simultaneously, THEN exactly one redemption is accepted.",
                   "GIVEN the losing or repeated request, WHEN returned, THEN the original collection time and station are shown.",
                   "GIVEN one operation ID, WHEN retried, THEN the original result is returned."],
                  priority="Must", points=8, status="ready", phase="July MVP", depends=["DAVI-FRB-04"]),
            story("DAVI-FRB-06", "Controlled override and reversal", "authorized supervisor", "record an exception with a reason", "unusual cases can be handled without destroying auditability",
                  ["GIVEN an ineligible or previously collected result, WHEN override is attempted, THEN supervisor permission and a mandatory reason are required.",
                   "GIVEN a reversal, WHEN permitted, THEN a new reversal event is written and the original redemption remains visible."],
                  priority="Should", points=5, status="ready", phase="After July", depends=["DAVI-FRB-05"]),
            story("DAVI-FRB-07", "Reconcile digital redemptions with stock", "freebie lead", "compare accepted claims, overrides and remaining physical inventory", "loss and data discrepancies are visible",
                  ["GIVEN a freebie, WHEN reconciliation runs, THEN starting stock, accepted redemptions, reversals, overrides and expected remainder are shown.",
                   "GIVEN a discrepancy, WHEN identified, THEN it can be assigned and annotated without changing original records."],
                  priority="Must", points=5, status="ready", phase="July MVP", depends=["DAVI-FRB-05"]),
        ],
    },
    {
        "id": "DAVI-05",
        "title": "Kiosk Application Adaptation and UX",
        "value": "The contributed kiosk becomes a clear Axon-operated interface that event staff can use under pressure.",
        "stories": [
            story("DAVI-KSK-01", "Replace live Davi transaction dependencies", "kiosk developer", "route check-in and freebie decisions directly to Axon", "Davi availability does not block event operations",
                  ["GIVEN repository API calls, WHEN adaptation is complete, THEN check-in and freebie calls use Axon endpoints.",
                   "GIVEN non-operational Davi community features, WHEN retained, THEN they are isolated from admission and collection success."],
                  priority="Must", points=8, status="blocked", phase="July MVP", depends=["DAVI-DISC-04", "DAVI-CHK-05", "DAVI-FRB-03"]),
            story("DAVI-KSK-02", "Create explicit kiosk states", "event staff", "see ready, reading, validating, success and exception states", "I always know what the station is doing",
                  ["GIVEN the kiosk, WHEN idle, THEN a prominent ready-to-tap instruction is shown.",
                   "GIVEN a tap, WHEN processing, THEN duplicate input is temporarily locked and progress is visible.",
                   "GIVEN each Axon business result, WHEN returned, THEN a distinct color, title, instruction and optional attendee name are displayed."],
                  priority="Must", points=5, status="blocked", phase="July MVP", depends=["DAVI-DISC-01"]),
            story("DAVI-KSK-03", "Show plain-language errors and fallback", "event staff", "receive actionable messages rather than technical codes", "I can resolve the queue without engineering knowledge",
                  ["GIVEN card_not_found, WHEN returned, THEN the kiosk instructs staff to search or scan QR.",
                   "GIVEN wrong_event or not_verified, WHEN returned, THEN the reason and support action are clear.",
                   "GIVEN timeout, WHEN displayed, THEN retry and fallback options are available without creating duplicates."],
                  priority="Must", points=3, status="ready", phase="July MVP", depends=["DAVI-CHK-05"]),
            story("DAVI-KSK-04", "Display connectivity and station identity", "event lead", "see whether the kiosk is online and correctly assigned", "misconfiguration is caught before it affects attendees",
                  ["GIVEN the application header, WHEN active, THEN event, station and connectivity state are visible.",
                   "GIVEN wrong event/station configuration, WHEN detected, THEN operations are blocked until corrected."],
                  priority="Must", points=3, status="ready", phase="July MVP", depends=["DAVI-STN-01", "DAVI-STN-02"]),
            story("DAVI-KSK-05", "Accessible and device-tested kiosk interface", "event staff", "operate the kiosk reliably on the approved device fleet", "the physical workflow remains fast and inclusive",
                  ["GIVEN approved kiosk devices, WHEN used in portrait/landscape as designed, THEN controls remain legible and touch targets are at least 44 pixels.",
                   "GIVEN success or rejection, WHEN displayed, THEN color is not the only indicator.",
                   "GIVEN sunlight/noisy venue conditions, WHEN rehearsed, THEN visual and optional audio/haptic feedback remain understandable."],
                  priority="Must", points=5, status="blocked", phase="July MVP", depends=["DAVI-DISC-03", "DAVI-KSK-02"]),
        ],
    },
    {
        "id": "DAVI-06",
        "title": "Limited Offline Mode and Synchronization",
        "value": "A controlled station can continue provisionally during connectivity loss without pretending disconnected devices have perfect global duplicate prevention.",
        "stories": [
            story("DAVI-OFF-01", "Define the minimum encrypted offline dataset", "security and operations owner", "cache only the event data needed for provisional decisions", "offline capability does not become uncontrolled PII replication",
                  ["GIVEN the cache design, WHEN approved, THEN it includes event, safe card lookup, attendee ID/display name, eligibility, entitlement and last-known use state only as needed.",
                   "GIVEN excluded data, WHEN reviewed, THEN payment proof, bank details, auth secrets, fraud metadata and unnecessary contact details are absent.",
                   "GIVEN a cache version, WHEN expired, THEN the kiosk stops using it."],
                  priority="Must", points=5, status="ready", phase="July MVP"),
            story("DAVI-OFF-02", "Record provisional offline check-ins", "designated offline entrance", "validate cached cards and queue signed operations", "one entrance can continue during an outage",
                  ["GIVEN a valid cached attendee, WHEN Axon is unreachable, THEN the designated kiosk records a provisional operation with unique ID and local sequence.",
                   "GIVEN a repeat on the same device, WHEN attempted, THEN it is shown as already provisionally checked in.",
                   "GIVEN an unresolvable card, WHEN offline, THEN the kiosk routes to manual supervisor handling."],
                  priority="Must", points=8, status="ready", phase="July MVP", depends=["DAVI-OFF-01", "DAVI-CHK-01"]),
            story("DAVI-OFF-03", "Persist the offline queue safely", "kiosk operator", "retain queued actions through app restart or battery loss", "provisional operations are not silently lost",
                  ["GIVEN queued operations, WHEN the app restarts, THEN unacknowledged records remain.",
                   "GIVEN local storage, WHEN inspected, THEN records are encrypted and credentials are stored using secure platform facilities.",
                   "GIVEN acknowledged synchronization, WHEN complete, THEN retention follows the approved cleanup policy."],
                  priority="Must", points=5, status="blocked", phase="July MVP", depends=["DAVI-DISC-04", "DAVI-STN-05"]),
            story("DAVI-OFF-04", "Synchronize idempotently after reconnection", "kiosk application", "upload queued operations without duplicates", "recovery is reliable",
                  ["GIVEN reconnection, WHEN queued operations are submitted, THEN Axon validates device, event, operation ID and sequence.",
                   "GIVEN the same batch is submitted twice, WHEN processed, THEN original results are returned.",
                   "GIVEN a conflict, WHEN detected, THEN it is retained for reconciliation rather than silently overwritten."],
                  priority="Must", points=8, status="ready", phase="July MVP", depends=["DAVI-OFF-02", "DAVI-OFF-03"]),
            story("DAVI-OFF-05", "Restrict offline freebie operation", "freebie lead", "use only one offline station per freebie type", "physical stock is not released twice across disconnected stations",
                  ["GIVEN connectivity loss, WHEN offline freebie mode is approved, THEN only the designated station may create provisional claims.",
                   "GIVEN another station, WHEN it attempts offline collection for that item, THEN it is blocked.",
                   "GIVEN offline handover, WHEN confirmed, THEN a visible manual stock tally and supervisor identity are required."],
                  priority="Must", points=5, status="ready", phase="July MVP", depends=["DAVI-FRB-05", "DAVI-OFF-01"]),
            story("DAVI-OFF-06", "Multi-station local venue coordination", "event technology lead", "coordinate disconnected stations over a local venue server", "offline duplicate prevention approaches online reliability",
                  ["GIVEN a local venue network, WHEN stations are disconnected from the internet but connected locally, THEN accepted actions are shared through one authority.",
                   "GIVEN local-server failure, WHEN it occurs, THEN the system falls back to the approved single-station procedure."],
                  priority="Could", points=13, status="ready", phase="After July", depends=["DAVI-OFF-04"]),
        ],
    },
    {
        "id": "DAVI-07",
        "title": "Testing, Rehearsal, Release and Event Operations",
        "value": "The NFC pilot is proven with real hardware, realistic concurrency, trained staff and an explicit fallback before attendees arrive.",
        "stories": [
            story("DAVI-QA-01", "Automate card, check-in and freebie API tests", "development team", "cover success, rejection, idempotency and authorization", "core rules remain stable during iteration",
                  ["GIVEN unit/integration tests, WHEN run, THEN active, unknown, revoked, wrong-event and ineligible card cases are covered.",
                   "GIVEN repeated operation IDs, WHEN tested, THEN no duplicate accepted action is created.",
                   "GIVEN unauthorized station scope, WHEN tested, THEN the API returns forbidden."],
                  priority="Must", points=8, status="ready", phase="July MVP"),
            story("DAVI-QA-02", "Run concurrency and retry tests", "quality engineer", "simulate simultaneous taps and network timeouts", "duplicate prevention is proven rather than assumed",
                  ["GIVEN at least 20 concurrent attempts for one attendee, WHEN executed, THEN one accepted check-in exists.",
                   "GIVEN concurrent freebie confirmation, WHEN executed, THEN accepted quantity never exceeds entitlement.",
                   "GIVEN timeout followed by retry, WHEN tested, THEN idempotency returns the original result."],
                  priority="Must", points=5, status="ready", phase="July MVP", depends=["DAVI-CHK-02", "DAVI-FRB-05"]),
            story("DAVI-QA-03", "Test the approved device and card matrix", "event technology lead", "validate every production phone/reader and card combination", "hardware surprises are removed",
                  ["GIVEN each approved combination, WHEN tested, THEN scan success rate, median read time, permission flow and recovery steps are recorded.",
                   "GIVEN an unapproved combination, WHEN proposed for event use, THEN it is rejected or separately certified."],
                  priority="Must", points=5, status="blocked", phase="July MVP", depends=["DAVI-DISC-03", "DAVI-KSK-05"]),
            story("DAVI-QA-04", "Test degraded and offline conditions", "quality engineer", "simulate slow, intermittent and absent connectivity", "fallback procedures are proven",
                  ["GIVEN slow or lost network, WHEN operations run, THEN the kiosk clearly reports state and does not create uncontrolled retries.",
                   "GIVEN queued operations, WHEN connectivity returns, THEN they synchronize and conflicts are visible.",
                   "GIVEN app restart while offline, WHEN reopened, THEN the queue remains intact."],
                  priority="Must", points=5, status="ready", phase="July MVP", depends=["DAVI-OFF-04"]),
            story("DAVI-QA-05", "Conduct a full event rehearsal", "event operations lead", "run entrance, support and freebie workflows with realistic queues", "staff and technology are validated together",
                  ["GIVEN trained staff and production devices, WHEN rehearsal runs, THEN tap, duplicate, lost card, QR fallback, manual lookup and outage scenarios are performed.",
                   "GIVEN rehearsal metrics, WHEN reviewed, THEN tap latency, error rate, queue handling and manual intervention are recorded.",
                   "GIVEN a critical failure, WHEN discovered, THEN the release is blocked until fixed or NFC scope is reduced."],
                  priority="Must", points=8, status="blocked", phase="July MVP", depends=["All July functional stories"]),
            story("DAVI-QA-06", "Publish the event-day runbook", "operations lead", "give nontechnical staff a visual operating guide", "common issues are resolved consistently",
                  ["GIVEN the final workflow, WHEN documented, THEN startup, station check, tap results, lost card, QR fallback, outage, override and shutdown procedures are included.",
                   "GIVEN each exception, WHEN read, THEN the guide identifies the first action and escalation owner in plain language."],
                  priority="Must", points=5, status="ready", phase="July MVP", depends=["DAVI-QA-05"]),
            story("DAVI-QA-07", "Establish monitoring and incident command", "incident commander", "observe station activity and coordinate technical/operational response", "issues are contained quickly",
                  ["GIVEN event day, WHEN operations start, THEN named Axon technical, kiosk technical, entrance, freebie and support owners are available.",
                   "GIVEN a lost device or error spike, WHEN reported, THEN the station can be revoked and fallback activated.",
                   "GIVEN a major incident, WHEN declared, THEN one incident commander owns the operational decision."],
                  priority="Must", points=5, status="ready", phase="July MVP", depends=["DAVI-STN-04"]),
            story("DAVI-QA-08", "Complete post-event reconciliation and review", "product and operations owners", "close queues, reconcile stock and capture lessons", "the pilot produces trustworthy outcomes and a clear next decision",
                  ["GIVEN event completion, WHEN closing begins, THEN all offline queues synchronize and kiosk credentials/caches are revoked or deleted.",
                   "GIVEN attendance and freebies, WHEN reconciled, THEN duplicates, overrides, conflicts and physical-stock variance are reviewed.",
                   "GIVEN findings, WHEN retrospective completes, THEN expand, iterate or retire decisions are recorded."],
                  priority="Must", points=5, status="ready", phase="July MVP", depends=["DAVI-QA-05", "DAVI-QA-07"]),
        ],
    },
]


BASE_CSS = r"""
:root{
  --ink:#14203a;--muted:#64708a;--line:#dfe4ee;--paper:#fbfaf7;--white:#fff;
  --purple:#6328ce;--violet:#8b4dff;--orange:#f46922;--green:#15916c;
  --red:#d94747;--amber:#b66a00;--blue:#2369b3;--navy:#15233f;
  --lilac:#f1ebff;--mint:#e8f7f1;--cream:#fff6ea;--sky:#eaf4ff;--rose:#fdecec;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.55}
a{color:inherit}
.hero{position:relative;overflow:hidden;background:var(--navy);color:white;padding:72px max(6vw,42px) 64px}
.hero:after{content:"";position:absolute;width:420px;height:420px;border-radius:50%;background:var(--purple);right:-145px;top:-170px;box-shadow:-115px 108px 0 -55px var(--orange)}
.hero-inner{position:relative;z-index:1;max-width:1120px;margin:auto}
.eyebrow{font-size:.75rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#c5b4ff}
h1{font-size:clamp(2.4rem,5vw,4.9rem);line-height:.98;letter-spacing:-.045em;margin:20px 0;max-width:920px}
.hero p{font-size:1.15rem;color:#d5daeb;max-width:780px}
.meta{display:flex;flex-wrap:wrap;gap:10px;margin-top:30px}
.meta span,.chip{border-radius:999px;padding:7px 12px;font-size:.75rem;font-weight:800;letter-spacing:.03em}
.meta span{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15)}
.layout{max-width:1200px;margin:auto;padding:42px max(4vw,28px) 90px}
.nav{position:sticky;top:0;z-index:10;background:rgba(251,250,247,.94);backdrop-filter:blur(12px);border-bottom:1px solid var(--line);padding:12px max(4vw,28px)}
.nav-inner{max-width:1200px;margin:auto;display:flex;gap:8px;overflow:auto}
.nav a{white-space:nowrap;text-decoration:none;border:1px solid var(--line);background:white;padding:7px 11px;border-radius:999px;font-size:.75rem;font-weight:700}
.nav a:hover{border-color:var(--purple);color:var(--purple)}
h2{font-size:clamp(1.7rem,3vw,2.55rem);line-height:1.1;letter-spacing:-.035em;margin:62px 0 18px}
h3{font-size:1.2rem;line-height:1.25;margin:0}
.lede{font-size:1.05rem;color:var(--muted);max-width:850px}
.callout{border-radius:22px;padding:24px 28px;margin:22px 0;background:var(--navy);color:white}
.callout strong{color:#bfa9ff}
.callout p{color:#d5daeb;margin:.45rem 0 0}
.grid{display:grid;gap:18px}
.grid-2{grid-template-columns:repeat(2,minmax(0,1fr))}
.grid-3{grid-template-columns:repeat(3,minmax(0,1fr))}
.metric{border:1px solid var(--line);background:white;border-radius:18px;padding:22px}
.metric .num{font-size:2.3rem;font-weight:850;letter-spacing:-.04em}
.metric .label{color:var(--muted);font-size:.82rem}
.statusbar{display:flex;height:13px;border-radius:999px;overflow:hidden;background:#eee;margin:16px 0}
.statusbar span{display:block;height:100%}
.legend{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}
.chip{display:inline-flex;align-items:center;gap:6px}
.status-verified{background:var(--mint);color:#0b7655}.status-partial{background:var(--cream);color:#9a5200}
.status-gap{background:var(--rose);color:#ad2f2f}.status-deferred{background:#edf0f5;color:#4d586d}
.status-verify{background:var(--sky);color:#185b9e}.status-ready{background:var(--mint);color:#0b7655}
.status-blocked{background:var(--rose);color:#ad2f2f}
.priority-Must{background:var(--red);color:white}.priority-Should{background:var(--orange);color:white}
.priority-Could{background:var(--blue);color:white}.priority-Wont{background:#5d6678;color:white}
.epic{margin:58px 0 18px;padding:26px 28px;border-radius:24px;background:linear-gradient(135deg,var(--navy),#283b64);color:white}
.epic-id{color:#bfa9ff;font-size:.78rem;font-weight:850;letter-spacing:.1em}
.epic h2{font-size:2rem;margin:8px 0 7px;color:white}
.epic p{color:#d0d7e8;margin:0;max-width:920px}
.story{background:white;border:1px solid var(--line);border-radius:20px;padding:22px 24px;margin:14px 0;box-shadow:0 6px 22px rgba(25,38,68,.035);break-inside:avoid}
.story-top{display:flex;gap:12px;align-items:flex-start;justify-content:space-between}
.story-heading{display:flex;gap:12px;align-items:flex-start}
.story-id{font-family:"SFMono-Regular",Consolas,monospace;color:var(--purple);font-weight:800;font-size:.8rem;padding-top:3px}
.badges{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.badge{border-radius:999px;padding:4px 8px;font-size:.67rem;font-weight:850;letter-spacing:.025em}
.user-story{margin:14px 0;padding:14px 16px;background:#f7f5fb;border-left:4px solid var(--purple);border-radius:0 12px 12px 0;color:#35415b}
.user-story strong{color:var(--ink)}
.ac-title{font-size:.76rem;letter-spacing:.08em;text-transform:uppercase;font-weight:850;color:var(--purple)}
.ac{margin:8px 0 0;padding-left:20px}
.ac li{margin:6px 0;color:#3c4860}
.details{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:15px;padding-top:14px;border-top:1px solid var(--line);font-size:.8rem;color:var(--muted)}
.details strong{color:var(--ink)}
.note{margin-top:12px;padding:11px 13px;border-radius:12px;background:var(--cream);color:#714300;font-size:.83rem}
table{width:100%;border-collapse:separate;border-spacing:0;background:white;border:1px solid var(--line);border-radius:18px;overflow:hidden;margin:18px 0}
th{background:var(--navy);color:white;text-align:left;padding:12px;font-size:.76rem;text-transform:uppercase;letter-spacing:.05em}
td{padding:11px 12px;border-top:1px solid var(--line);vertical-align:top;font-size:.88rem}
tr:nth-child(even) td{background:#fafbfc}
.flow{display:flex;gap:8px;align-items:stretch;overflow:auto;padding:8px 0}
.flow .step{min-width:175px;flex:1;background:white;border:1px solid var(--line);border-radius:18px;padding:18px}
.step-num{width:30px;height:30px;border-radius:50%;background:var(--purple);color:white;display:grid;place-items:center;font-weight:850;margin-bottom:15px}
.arrow{display:grid;place-items:center;color:var(--purple);font-weight:900}
.scope{border-radius:20px;padding:22px;background:white;border:1px solid var(--line)}
.scope.must{border-top:6px solid var(--green)}.scope.defer{border-top:6px solid var(--orange)}
.decision{border:2px solid var(--purple);border-radius:22px;padding:26px;background:white;margin:22px 0}
.decision-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:18px 0}
.decision-option{border:1px solid var(--line);border-radius:14px;padding:14px;font-weight:750}
.signature{display:grid;grid-template-columns:2fr 1fr;gap:24px;margin-top:28px}
.signature-line{border-bottom:1px solid var(--ink);min-height:34px}
.footer{margin-top:70px;border-top:1px solid var(--line);padding-top:24px;color:var(--muted);font-size:.8rem}
code{font-family:"SFMono-Regular",Consolas,monospace;background:#f1edf9;color:#5423b1;padding:1px 5px;border-radius:5px}
@media(max-width:760px){.grid-2,.grid-3,.decision-options,.signature{grid-template-columns:1fr}.story-top{display:block}.badges{justify-content:flex-start;margin-top:10px}.details{grid-template-columns:1fr}.hero{padding-top:54px}.flow{display:grid}.arrow{transform:rotate(90deg)}}
@media print{.nav{display:none}.hero{padding:42px}.layout{padding:24px}.story{box-shadow:none}a{text-decoration:none}.epic,.callout,.story,.scope{break-inside:avoid}h2{break-after:avoid}}
"""


def h(text):
    return escape(str(text), quote=True)


def status_badge(key, *, executive=False):
    label, cls = (EXECUTIVE_STATUS if executive else STATUS)[key]
    return f'<span class="badge {cls}">{h(label)}</span>'


def indefinite_article(role):
    return "an" if role[:1].lower() in "aeiou" else "a"


def executive_effort(points):
    if points <= 2:
        return "Small effort"
    if points <= 5:
        return "Medium effort"
    return "Large effort"


def executive_phase(phase):
    return {
        "Current baseline": "Current MVP",
        "Production hardening": "Safety improvement",
        "Production readiness": "Launch preparation",
        "Post-MVP hardening": "After MVP",
        "Required before kiosk rollout": "Before kiosk rollout",
        "Required for DAVI/NFC iteration": "Before NFC expansion",
    }.get(phase, phase)


def executive_criterion(item):
    text = item.replace("GIVEN ", "If ", 1).replace(", WHEN ", ", when ").replace(", THEN ", ", then ")
    replacements = {
        "a non-admin JWT": "a user does not have Administrator permission",
        "Axon issues access and refresh tokens": "Axon signs the user in and creates a renewable session",
        "Axon returns a user session and routes the user": "Axon signs the user in and routes them",
        "an admin endpoint is requested": "a protected administrative function is requested",
        "the page hydrates the session before rendering protected content": "the system confirms the user’s identity and permission before showing protected information",
        "Cloudinary returns a hosted asset and Axon stores or embeds the URL": "the approved file-storage service safely stores the image and Axon keeps its link",
        "proof_submitted status": "a payment proof is awaiting review",
        "registration and latest proof become approved/verified and QR tokens are created": "the registration is approved and attendee QR tickets are created",
        "up to 20 IDs": "up to 20 selected registrations",
        "HMAC-signed token": "tamper-resistant QR credential",
        "signature verification fails": "the altered QR ticket is rejected",
        "token fields": "the credential details",
        "a QR token, when parsed": "a QR ticket is created",
        "key version and issuance/expiry context": "its security version, issue date and expiry information",
        "CSV output with formula-injection protection": "a spreadsheet that blocks unsafe formulas",
        "CSV export": "a spreadsheet export",
        "the page/API is requested": "the administrator screen or supporting service is opened",
        "resolvedAt is stored": "the resolution date and time are recorded",
        "an unknown DTO field": "unexpected information",
        "the API rejects it": "the system rejects it",
        "an API response": "the system responds",
        "Helmet and configured CORS protections are applied": "standard browser and access security protections are applied",
        "the API/web integrations can submit them to Sentry when configured": "the monitoring service records them and can alert the responsible team",
        "HTTP requests": "system requests",
        "authorization and cookie headers are redacted": "login credentials and session information are removed from logs",
        "database and Redis availability": "the main database and supporting services",
        "/health is requested": "the automated health check runs",
        "Axon reports database and Redis health": "Axon reports whether its main data and supporting services are available",
        "the API test command": "the automated system checks",
        "unit suites for authentication, tickets, featured events and QR tokens pass": "checks for login, events, tickets and QR credentials pass",
        "Playwright configuration and credentials": "the browser-test setup is available",
        "E2E tests": "full-journey tests",
        "public and admin smoke flows are exercised": "essential attendee and administrator journeys are tested",
        "WCAG AA": "a recognized accessibility standard",
        "the UAT environment": "the protected business test environment",
        "UAT domains, database, Redis, upload folders, email controls and environment markers": "separate test websites, data, supporting services, file storage and email controls",
        "a change to main or uat": "a change is prepared for the test or live system",
        "CI runs": "automated release checks run",
        "lint, type-check, builds and Prisma validation must complete": "code-quality, compatibility, build and database checks must pass",
        "a Production promotion": "a live release",
        "a completed UAT record, rollback plan and recovery evidence": "a completed business test record, a rollback plan and recovery evidence",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    return text


def executive_value(value):
    if value.startswith("I "):
        value = "They " + value[2:]
    elif value.startswith("my "):
        value = "Their " + value[3:]
    return value.replace(" my ", " their ")


def executive_want(want):
    text = want.replace(" my ", " their ")
    if text.startswith("my "):
        text = "their " + text[3:]
    return text.replace(
        "check database and Redis availability",
        "check whether the main database and supporting services are available",
    )


def story_html(s, *, executive=False):
    criteria = [executive_criterion(item) for item in s["ac"]] if executive else s["ac"]
    ac = "".join(f"<li>{h(item)}</li>" for item in criteria)
    if executive:
        evidence = "Confirmed through a review of the current system and supporting records." if s["evidence"] else "To be confirmed during delivery."
    else:
        evidence = "<br>".join(f"<code>{h(item)}</code>" for item in s["evidence"]) or "Not applicable"
    deps = ", ".join(s["depends"]) if s["depends"] else "None"
    note_title = "What leadership should know" if executive else "Product note"
    note = f'<div class="note"><strong>{note_title}:</strong> {h(s["notes"])}</div>' if s["notes"] else ""
    priority = EXECUTIVE_PRIORITY.get(s["priority"], s["priority"]) if executive else s["priority"]
    effort = executive_effort(s["points"]) if executive else f"{s['points']} SP"
    phase = executive_phase(s["phase"]) if executive else s["phase"]
    title = EXECUTIVE_TITLES.get(s["id"], s["title"]) if executive else s["title"]
    outcome_html = (
        f"<strong>Business outcome:</strong> Enables the {h(s['role'])} to {h(executive_want(s['want']))}. <strong>Why it matters:</strong> {h(executive_value(s['value']))}."
        if executive
        else f"<strong>As {indefinite_article(s['role'])} {h(s['role'])},</strong> I want to {h(s['want'])}, so that {h(s['value'])}."
    )
    return f"""
<article class="story" id="{h(s['id'])}">
  <div class="story-top">
    <div class="story-heading"><span class="story-id">{h(s['id'])}</span><h3>{h(title)}</h3></div>
    <div class="badges">
      {status_badge(s['status'], executive=executive)}
      <span class="badge priority-{h(s['priority'])}">{h(priority)}</span>
      <span class="badge status-deferred">{h(effort)}</span>
      <span class="badge status-verify">{h(phase)}</span>
    </div>
  </div>
  <div class="user-story">{outcome_html}</div>
  <div class="ac-title">{"What success looks like" if executive else "Acceptance criteria"}</div>
  <ul class="ac">{ac}</ul>
  <div class="details">
    <div><strong>{"How this was assessed" if executive else "Evidence / planned component"}</strong><br>{evidence}</div>
    <div><strong>{"What must be in place" if executive else "Dependencies"}</strong><br>{h(deps)}</div>
  </div>
{note}
</article>"""


def epic_html(epic, *, executive=False):
    stories = "".join(story_html(s, executive=executive) for s in epic["stories"])
    return f"""
<section id="{h(epic['id'])}">
  <div class="epic">
    <div class="epic-id">{h(epic['id'])}</div>
    <h2>{h(epic['title'])}</h2>
    <p><strong>Business value:</strong> {h(epic['value'])}</p>
  </div>
{stories}
</section>"""


def flatten(epics):
    return [s for e in epics for s in e["stories"]]


def document_shell(title, subtitle, version, status, date, nav, body, description):
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{h(title)}</title>
  <meta name="description" content="{h(description)}">
  <style>{BASE_CSS}</style>
</head>
<body>
  <header class="hero">
    <div class="hero-inner">
      <div class="eyebrow">Axon Tickets · Product Management</div>
      <h1>{h(title)}</h1>
      <p>{h(subtitle)}</p>
      <div class="meta">
        <span>Version {h(version)}</span><span>{h(status)}</span><span>{h(date)}</span>
      </div>
    </div>
  </header>
  <nav class="nav"><div class="nav-inner">{nav}</div></nav>
  <main class="layout">{body}</main>
</body>
</html>"""


def build_mvp():
    stories = flatten(MVP_EPICS)
    counts = Counter(s["status"] for s in stories)
    total = len(stories)
    nav = "".join(f'<a href="#{h(e["id"])}">{h(e["id"])} · {h(e["title"])}</a>' for e in MVP_EPICS)
    width = {
        k: (counts[k] / total * 100 if total else 0)
        for k in ("verified", "partial", "gap", "deferred", "verify")
    }
    summary_rows = "".join(
        f"<tr><td>{h(e['id'])}</td><td>{h(e['title'])}</td><td>{len(e['stories'])}</td>"
        f"<td>{sum(1 for s in e['stories'] if s['status']=='verified')}</td><td>{sum(1 for s in e['stories'] if s['status']=='partial')}</td>"
        f"<td>{sum(1 for s in e['stories'] if s['status'] in ('gap','verify','deferred'))}</td></tr>"
        for e in MVP_EPICS
    )
    body = f"""
<section id="summary">
  <h2>Executive summary</h2>
  <p class="lede">This document compares the approved MVP requirements with the system that exists today. It shows what is already working, what works with known limitations, and what still requires completion or business confirmation.</p>
  <div class="grid grid-3">
    <div class="metric"><div class="num">{total}</div><div class="label">individual MVP requirements reviewed</div></div>
    <div class="metric"><div class="num">{counts['verified']}</div><div class="label">requirements working now</div></div>
    <div class="metric"><div class="num">{len(MVP_EPICS)}</div><div class="label">business capability areas</div></div>
  </div>
  <div class="statusbar" aria-label="Backlog status distribution">
    <span style="width:{width['verified']:.2f}%;background:var(--green)"></span>
    <span style="width:{width['partial']:.2f}%;background:var(--orange)"></span>
    <span style="width:{width['gap']:.2f}%;background:var(--red)"></span>
    <span style="width:{width['verify']:.2f}%;background:var(--blue)"></span>
    <span style="width:{width['deferred']:.2f}%;background:#7d8799"></span>
  </div>
  <div class="legend">
    {status_badge('verified', executive=True)} {counts['verified']}
    {status_badge('partial', executive=True)} {counts['partial']}
    {status_badge('gap', executive=True)} {counts['gap']}
    {status_badge('verify', executive=True)} {counts['verify']}
    {status_badge('deferred', executive=True)} {counts['deferred']}
  </div>
  <div class="callout">
    <strong>Executive conclusion</strong>
    <p>Axon currently supports publishing events, email-code registration, manual payment review, digital ticket delivery, QR entry, administrative operations and business reporting. A separate protected test system and automated release checks are also in place. The sign-off applies only to the business areas, requirements, expected results and current completion status shown in this document.</p>
  </div>
</section>

<section>
  <h2>How to read this document</h2>
  <div class="grid grid-3">
    <div class="scope must"><h3>Working now</h3><p>The requirement is present in the current system and was confirmed during the review.</p></div>
    <div class="scope"><h3>Working with limitations</h3><p>The main function can be used, but a stated safeguard, role, test or supporting control remains incomplete.</p></div>
    <div class="scope defer"><h3>Open or awaiting confirmation</h3><p>The requirement is not yet available, or its live business configuration still needs evidence.</p></div>
  </div>
  <div class="callout">
    <strong>Reading each requirement</strong>
    <p><strong>Business outcome</strong> explains why the item matters. <strong>What success looks like</strong> describes the observable result expected by users. <strong>What leadership should know</strong> highlights any limitation or decision that requires attention.</p>
  </div>
</section>

<section>
  <h2>Summary by business area</h2>
  <table>
    <thead><tr><th>Reference</th><th>Business area</th><th>Requirements</th><th>Working now</th><th>With limitations</th><th>Open / confirm</th></tr></thead>
    <tbody>{summary_rows}</tbody>
  </table>
</section>

<section>
  <h2>Plain-language glossary</h2>
  <table>
    <thead><tr><th>Term</th><th>Meaning for the business</th></tr></thead>
    <tbody>
      <tr><td>OTP</td><td>A one-time code sent by email to confirm the user’s identity.</td></tr>
      <tr><td>QR credential</td><td>The attendee’s scannable digital ticket used for event entry.</td></tr>
      <tr><td>UAT</td><td>A protected test version of the system where business users confirm that key journeys work before a live release.</td></tr>
      <tr><td>Role-based access</td><td>Giving each staff member only the functions needed for their job, such as Organizer, Payment Reviewer or Check-in Staff.</td></tr>
      <tr><td>Audit trail</td><td>A dated history showing who performed an important action and what changed.</td></tr>
      <tr><td>Load testing</td><td>A controlled simulation used to prove how the system behaves when many people use it at the same time.</td></tr>
    </tbody>
  </table>
</section>

{''.join(epic_html(e, executive=True) for e in MVP_EPICS)}

<section id="next">
  <h2>Open items within the documented MVP scope</h2>
  <div class="flow">
    <div class="step"><div class="step-num">1</div><h3>Protect payment proofs</h3><p>Make uploaded payment screenshots private and allow viewing only for an authorized person and a limited time.</p></div>
    <div class="arrow">→</div>
    <div class="step"><div class="step-num">2</div><h3>Limit staff access</h3><p>Create separate Organizer and event-staff permissions before giving more people access to administrative tools.</p></div>
    <div class="arrow">→</div>
    <div class="step"><div class="step-num">3</div><h3>Prove peak capacity</h3><p>Run controlled tests with many simultaneous users before making a public claim about supporting 1,000 users or a major traffic surge.</p></div>
    <div class="arrow">→</div>
    <div class="step"><div class="step-num">4</div><h3>Strengthen operational records</h3><p>Keep a permanent history of attendance actions and complete recovery, accessibility and full-journey testing.</p></div>
  </div>
</section>

<section id="approval">
  <h2>MVP backlog scope sign-off</h2>
  <div class="decision">
    <h3>Approval applies only to the requirements and current status shown in this document</h3>
    <p>By signing below, the approver confirms that the business areas, individual requirements, expected results, priorities and current completion status shown here are accepted as the MVP baseline. This does not approve anything that is not expressly listed in this document.</p>
    <table>
      <thead><tr><th>Included in this sign-off</th><th>Approval meaning</th></tr></thead>
      <tbody>
        <tr><td>MVP-01 through MVP-09</td><td>The nine business areas and their stated business value are accepted as the MVP scope.</td></tr>
        <tr><td>Individual requirements</td><td>The expected user and business results shown under each area are accepted as the product baseline.</td></tr>
        <tr><td>Current completion status</td><td>The labels Working now, Working with limitations, Not yet available and Confirmation required are acknowledged as accurate for this review.</td></tr>
        <tr><td>Open items</td><td>Anything shown with a limitation or open status remains unfinished and is not being approved as complete.</td></tr>
      </tbody>
    </table>
    <div class="decision-options">
      <div class="decision-option">☐ APPROVED AS DOCUMENTED</div>
      <div class="decision-option">☐ NEEDS REVISION</div>
      <div class="decision-option">☐ NOT APPROVED</div>
    </div>
    <div class="signature">
      <div><div class="signature-line"></div><small>Approver name and signature</small></div>
      <div><div class="signature-line"></div><small>Date</small></div>
    </div>
  </div>
</section>

<footer class="footer">
  <strong>Basis of this review:</strong> The current Axon Tickets system and supporting readiness documents were reviewed through June 23, 2026. “Working now” means the capability was found in the current system; it does not automatically mean that business acceptance testing or live-environment certification has been completed.<br><br>
  Axon Tickets · MVP Product Backlog v2.3 · Executive Review & Scope Sign-Off · June 23, 2026 · Confidential
</footer>
"""
    return document_shell(
        "Axon Tickets MVP Product Backlog",
        "An executive-friendly MVP baseline showing what is working, what has limitations, what remains open, and exactly what is being submitted for approval.",
        "2.3",
        "Executive Review & Scope Sign-Off",
        "June 23, 2026",
        nav,
        body,
        "Code-reconciled MVP product backlog for Axon Tickets.",
    )


def build_davi():
    stories = flatten(DAVI_EPICS)
    total = len(stories)
    points = sum(s["points"] for s in stories)
    counts = Counter(s["status"] for s in stories)
    phases = Counter(s["phase"] for s in stories)
    nav = '<a href="#north-star">North star</a><a href="#scope">Scope</a><a href="#sequence">Sequence</a>' + "".join(
        f'<a href="#{h(e["id"])}">{h(e["id"])} · {h(e["title"])}</a>' for e in DAVI_EPICS
    )
    summary_rows = "".join(
        f"<tr><td>{h(e['id'])}</td><td>{h(e['title'])}</td><td>{len(e['stories'])}</td><td>{sum(s['points'] for s in e['stories'])}</td>"
        f"<td>{sum(1 for s in e['stories'] if s['phase']=='Discovery')}</td><td>{sum(1 for s in e['stories'] if s['phase']=='July MVP')}</td>"
        f"<td>{sum(1 for s in e['stories'] if s['phase']=='After July')}</td></tr>"
        for e in DAVI_EPICS
    )
    body = f"""
<section id="north-star">
  <h2>Iteration north star</h2>
  <p class="lede">An attendee taps an NFC card. The kiosk reads a safe card identifier. Axon resolves the attendee, applies eligibility rules and records check-in or freebie collection. Davi does not need to approve the live transaction.</p>
  <div class="flow">
    <div class="step"><div class="step-num">1</div><h3>NFC card</h3><p>Presents an opaque token or documented card identifier.</p></div>
    <div class="arrow">→</div>
    <div class="step"><div class="step-num">2</div><h3>Axon-operated kiosk</h3><p>Reads the card and submits event, station and operation context.</p></div>
    <div class="arrow">→</div>
    <div class="step"><div class="step-num">3</div><h3>Axon API</h3><p>Authenticates the station and applies check-in or entitlement rules.</p></div>
    <div class="arrow">→</div>
    <div class="step"><div class="step-num">4</div><h3>Axon ledger</h3><p>Records the authoritative, auditable result.</p></div>
  </div>
  <div class="callout"><strong>Critical architecture boundary</strong><p>Davi contributes the kiosk repository and card-format knowledge. Axon owns card assignment, admission, freebies, offline recovery, audit and reporting. A Davi production outage must not prevent these operations.</p></div>
  <div class="grid grid-3">
    <div class="metric"><div class="num">{total}</div><div class="label">developer-ready stories</div></div>
    <div class="metric"><div class="num">{points}</div><div class="label">estimated points before refinement</div></div>
    <div class="metric"><div class="num">{len(DAVI_EPICS)}</div><div class="label">delivery epics</div></div>
  </div>
  <div class="legend">{status_badge('ready')} {counts['ready']} &nbsp; {status_badge('blocked')} {counts['blocked']}</div>
</section>

<section id="scope">
  <h2>July scope box</h2>
  <div class="grid grid-2">
    <div class="scope must">
      <h3>Must be included</h3>
      <ul>
        <li>Repository and real-card compatibility proof</li>
        <li>Approved kiosk device matrix</li>
        <li>Card assignment and replacement</li>
        <li>Axon-authoritative, atomic NFC check-in</li>
        <li>Event/station-scoped kiosk security</li>
        <li>QR and manual-search fallback</li>
        <li>One controlled freebie entitlement and collection flow</li>
        <li>Limited offline procedure, rehearsal and reconciliation</li>
      </ul>
    </div>
    <div class="scope defer">
      <h3>Explicitly deferred</h3>
      <ul>
        <li>Replacing QR entirely</li>
        <li>Attendee phones as virtual NFC cards</li>
        <li>Mixed untested Android/iPhone web kiosk fleet</li>
        <li>Multiple disconnected freebie stations for one item</li>
        <li>Community features coupled to admission</li>
        <li>Cross-event identity federation</li>
        <li>Full local venue coordination server</li>
        <li>Gamification and sponsor-facing dashboards</li>
      </ul>
    </div>
  </div>
</section>

<section id="sequence">
  <h2>Mandatory delivery sequence</h2>
  <p class="lede">The order below is a dependency chain, not a suggestion. Starting API or database implementation before card and repository discovery creates avoidable rework.</p>
  <div class="flow">
    <div class="step"><div class="step-num">1</div><h3>Prove</h3><p>Build repository, scan real cards, approve devices.</p></div><div class="arrow">→</div>
    <div class="step"><div class="step-num">2</div><h3>Decide</h3><p>Freeze business rules, scope and security model.</p></div><div class="arrow">→</div>
    <div class="step"><div class="step-num">3</div><h3>Build core</h3><p>Card lifecycle, station auth and atomic ledgers.</p></div><div class="arrow">→</div>
    <div class="step"><div class="step-num">4</div><h3>Adapt kiosk</h3><p>Connect Davi foundation directly to Axon.</p></div><div class="arrow">→</div>
    <div class="step"><div class="step-num">5</div><h3>Rehearse</h3><p>Real cards, concurrency, outages and trained staff.</p></div>
  </div>
  <table>
    <thead><tr><th>Epic</th><th>Capability</th><th>Stories</th><th>Points</th><th>Discovery</th><th>July MVP</th><th>After July</th></tr></thead>
    <tbody>{summary_rows}</tbody>
  </table>
</section>

<section>
  <h2>Definition of Ready</h2>
  <p class="lede">A story may enter implementation only when these conditions are true.</p>
  <div class="grid grid-3">
    <div class="scope"><h3>Business clarity</h3><p>User, outcome, rule decisions and acceptance criteria are approved.</p></div>
    <div class="scope"><h3>Technical clarity</h3><p>Dependencies, data ownership, API boundary and security assumptions are known.</p></div>
    <div class="scope"><h3>Test clarity</h3><p>Required cards, devices, environments and measurable success conditions are available.</p></div>
  </div>
</section>

{''.join(epic_html(e) for e in DAVI_EPICS)}

<section id="release">
  <h2>Release gates</h2>
  <table>
    <thead><tr><th>Gate</th><th>Required evidence</th><th>Failure decision</th></tr></thead>
    <tbody>
      <tr><td>G1 · Repository</td><td>Repository builds; external dependencies documented.</td><td>Stop NFC work and escalate to Davi.</td></tr>
      <tr><td>G2 · Card/device</td><td>Real card reads reliably on every approved kiosk device.</td><td>Reduce device scope or operate QR-only.</td></tr>
      <tr><td>G3 · Data/security</td><td>Card lifecycle, station access and minimum offline dataset approved.</td><td>No production credential or PII deployment.</td></tr>
      <tr><td>G4 · Correctness</td><td>Atomic check-in and freebie concurrency tests pass.</td><td>No multi-station launch.</td></tr>
      <tr><td>G5 · Operations</td><td>Full rehearsal, fallback and staff runbook completed.</td><td>Run QR/manual baseline only.</td></tr>
    </tbody>
  </table>
</section>

<section>
  <h2>Definition of Done for every July story</h2>
  <div class="grid grid-2">
    <div class="scope must"><h3>Product</h3><ul><li>Every acceptance criterion passes.</li><li>Plain-language success and failure behavior is reviewed by operations.</li><li>Out-of-scope behavior has not been added implicitly.</li></ul></div>
    <div class="scope"><h3>Engineering</h3><ul><li>Authorization and idempotency are tested.</li><li>Audit data excludes unnecessary PII.</li><li>Existing QR/manual flows have no regression.</li></ul></div>
    <div class="scope"><h3>Quality</h3><ul><li>Automated tests and real-device tests pass.</li><li>Concurrency and retry behavior is demonstrated.</li><li>Failure recovery is documented.</li></ul></div>
    <div class="scope defer"><h3>Operations</h3><ul><li>Monitoring and owners are named.</li><li>Runbook screenshots match the release.</li><li>Rollback or QR-only fallback is ready.</li></ul></div>
  </div>
</section>

<section>
  <h2>Greatest-value next story</h2>
  <div class="callout">
    <strong>DAVI-DISC-01 · Receive and build the kiosk repository</strong>
    <p>This story unlocks every downstream estimate and design decision. Do not create migrations or NFC APIs until the repository, real card output and production device approach are understood.</p>
  </div>
</section>

<footer class="footer">
  <strong>Planning assumptions:</strong> The Davi repository was not available in the Axon workspace when this backlog was authored. Stories marked Blocked require repository, card or device evidence. Estimates are initial planning values and must be refined by the delivery team after Discovery.<br><br>
  Axon Tickets × Davi · NFC Integration Product Backlog v1.0 · Approved Architecture Baseline · June 21, 2026 · Confidential
</footer>
"""
    return document_shell(
        "Axon × Davi NFC Integration Product Backlog",
        "A state-of-the-art, dependency-aware iteration backlog for NFC card assignment, Axon-owned check-in, freebie collection, kiosk security, limited offline operation and July validation.",
        "1.0",
        "Ready for Discovery",
        "June 21, 2026",
        nav,
        body,
        "Product backlog for the Axon Tickets and Davi NFC kiosk integration iteration.",
    )


def main():
    DOCS.mkdir(parents=True, exist_ok=True)
    MVP_OUT.write_text(build_mvp(), encoding="utf-8")
    DAVI_OUT.write_text(build_davi().replace("Davi", "DAVI"), encoding="utf-8")
    print(MVP_OUT)
    print(DAVI_OUT)


if __name__ == "__main__":
    main()
