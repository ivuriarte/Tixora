# Registration Funnel + Meta Pixel QA Checklist

## Environments
- Production domain
- Staging domain (if available)

## Required tools
- Meta Pixel Helper browser extension
- Meta Events Manager Test Events
- Browser DevTools console + network tab
- Vercel function logs
- Admin analytics funnel view

## Browser matrix
- Desktop Chrome
- iPhone Safari
- Android Chrome
- Facebook in-app browser

## Test scenarios

1. Event page view
- Open an event detail page.
- Verify `PageView` and `ViewContent` fire in Meta Pixel Helper.
- Verify internal event `event_page_viewed` appears in admin funnel counts.

2. Register CTA click
- Click Register / Register Now on event detail page.
- Verify `RegisterCTA_Clicked` fires.
- Verify internal `register_cta_clicked` increments.

3. Email submit + OTP request
- Enter valid email, click Send my code.
- Verify `Lead` and `OTP_Requested` fire immediately.
- Verify internal `email_submitted` and `otp_send_requested` are recorded.

4. OTP sent success
- Complete OTP send with a deliverable email.
- Verify `OTP_Sent` fires.
- Verify internal `otp_sent` increments.

5. OTP send failure
- Trigger a failure path (network offline or provider failure).
- Verify user-friendly error is shown.
- Verify internal `otp_send_failed` appears with safe reason metadata.

6. OTP verify success
- Enter correct OTP.
- Verify `CompleteRegistration` and `OTP_Verified` fire once.
- Verify internal `otp_verified` increments.
- Confirm redirect returns to event registration flow.

7. OTP verify failure
- Enter wrong OTP and expired OTP.
- Verify user-friendly error for each path.
- Verify internal `otp_verification_failed` increments.

8. Profile completion
- New user fills required name, birthday, gender, and city and continues.
- Verify missing, future, or implausibly old birthdays and blank city are rejected.
- Verify internal `profile_completed` increments.

9. Ticket selection started
- Reach attendee details / registration page after auth.
- Verify `TicketSelection_Started` fires.
- Verify internal `ticket_selection_started` increments.

9A. Referral validation and pricing
- Apply valid percentage and fixed-amount referral codes.
- Verify inactive, expired, future, wrong-tier, and exhausted codes fail safely.
- Verify the discount is calculated server-side and shown consistently through confirmation.
- Tamper with the client request and confirm submitted discount values are ignored.
- Run a concurrent last-use redemption and confirm the usage limit is not exceeded.

10. Checkout started
- Reach payment step page.
- Verify `InitiateCheckout` fires with PHP currency and value.
- Verify internal `payment_started` increments.

11. Payment proof submitted
- Upload valid payment proof.
- Verify `AddPaymentInfo` and `Registration_Submitted_For_Review` fire.
- Verify internal `payment_submitted` and `registration_submitted_for_review` increment.

12. Ticket issued
- Admin approves proof in verification queue.
- Verify internal `ticket_issued` increments.
- Open user registration detail (verified) and verify `Purchase` fires once.

## Security checks
- No OTP code appears in browser logs.
- No OTP code appears in server logs.
- No secrets/provider keys exposed in client payloads.
- Funnel metadata only contains safe diagnostics.
- Referral exports and management endpoints require event ownership.
- Public responses do not expose birthday, gender, or city.
- Demographic exports are limited to authorized event managers.

## Reliability checks
- Registration still works when Meta Pixel is blocked.
- Pixel events do not throw runtime errors.
- No duplicate event storms from simple refresh.
