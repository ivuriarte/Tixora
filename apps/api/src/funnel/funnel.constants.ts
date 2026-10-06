export const FUNNEL_STEPS = [
  'event_page_viewed',
  'register_cta_clicked',
  'email_submitted',
  'otp_send_requested',
  'otp_sent',
  'otp_send_failed',
  'otp_verified',
  'otp_verification_failed',
  'profile_started',
  'profile_completed',
  'ticket_selection_started',
  'payment_started',
  'payment_submitted',
  'registration_submitted_for_review',
  'ticket_issued',
  // Guest checkout hold (payloads carry no email, token or registration id).
  'hold_email_saved',
  'hold_resumed',
  'hold_expired_seen',
  'hold_cancelled',
  // Checkout confirm step and blocked registrations. Our own metadata fields are a fixed
  // shape: mode, httpStatus, code (fixed list, never an error message), where.
  'details_confirm_started',
  'details_confirm_succeeded',
  'details_confirm_failed',
  'order_not_owned_seen',
] as const;

export const FUNNEL_STATUSES = [
  'started',
  'success',
  'failed',
  'abandoned',
  'blocked',
] as const;

export type FunnelStep = (typeof FUNNEL_STEPS)[number];
export type FunnelStatus = (typeof FUNNEL_STATUSES)[number];
