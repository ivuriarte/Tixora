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
