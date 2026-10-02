import { anonymousBuyerLabel, CHECKOUT_STARTED_LABEL } from './registration-labels';

describe('anonymousBuyerLabel', () => {
  it('calls on-site QR registrations walk-ins', () => {
    expect(anonymousBuyerLabel({ status: 'verified', paymentMethod: 'onsite_qr' })).toBe('Walk-in attendee');
  });

  it('does not call an unpaid anonymous checkout a walk-in', () => {
    expect(anonymousBuyerLabel({ status: 'pending_payment', paymentMethod: null })).toBe(CHECKOUT_STARTED_LABEL);
  });

  it('falls back to a guest registration for everything else', () => {
    expect(anonymousBuyerLabel({ status: 'cancelled', paymentMethod: null })).toBe('Guest registration');
    expect(anonymousBuyerLabel({ status: 'proof_submitted' })).toBe('Guest registration');
  });
});
