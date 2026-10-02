export const CHECKOUT_STARTED_LABEL = 'Checkout started (no details yet)';

/**
 * Display name for a registration that has neither a lead attendee nor a linked user.
 *
 * - on-site QR registrations are real walk-ins;
 * - an unpaid `pending_payment` row is a guest who reached the payment step and left
 *   before giving any details (it must not be called a walk-in);
 * - anything else is a guest registration whose details were not captured.
 */
export function anonymousBuyerLabel(registration: {
  status: string;
  paymentMethod?: string | null;
}): string {
  if (registration.paymentMethod === 'onsite_qr') return 'Walk-in attendee';
  if (registration.status === 'pending_payment') return CHECKOUT_STARTED_LABEL;
  return 'Guest registration';
}
