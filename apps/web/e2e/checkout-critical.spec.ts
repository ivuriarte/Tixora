import type { Route } from '@playwright/test';
import { expect, expectNoBrowserFailures, test, type Page } from './support/qa-test';

const EVENT_ID = 'event-qa-paid';
const EVENT_SLUG = 'qa-paid-event';
const TIER_ID = 'tier-qa-standard';
const REGISTRATION_ID = 'registration-qa-001';
const GUEST_TOKEN = 'qa-scoped-guest-token';
const REFERENCE_NUMBER = 'AXN-QA-001';
const API_PATTERN = '**/api/v1/**';

const event = {
  id: EVENT_ID,
  slug: EVENT_SLUG,
  title: 'QA Paid Event',
  description: 'Deterministic Playwright checkout fixture.',
  venue: 'QA Convention Hall',
  address: 'Davao City',
  startsAt: '2027-02-20T01:00:00.000Z',
  endsAt: '2027-02-20T09:00:00.000Z',
  status: 'published',
  isFree: false,
  platformFee: 50,
  allowManualPayment: true,
  paymentMethods: [
    {
      name: 'GCash',
      type: 'ewallet',
      accountName: 'Axon QA',
      accountNumber: '09170000000',
      instructions: 'Use the registration reference as the payment note.',
    },
  ],
  agenda: [],
  eventType: 'standard',
  tiers: [
    {
      id: TIER_ID,
      name: 'General Admission',
      price: 1100,
      available: 50,
      maxPerOrder: 5,
      inclusions: [],
    },
  ],
};

interface MockCheckoutOptions {
  quantity?: number;
  authenticated?: boolean;
  duplicateConflict?: boolean;
  beginWithProofSubmitted?: boolean;
  rejectFirstOtp?: boolean;
}

interface MockCheckoutState {
  status: 'pending_payment' | 'proof_submitted' | 'pending_approval';
  confirmationCodeRequests: number;
  confirmPayload?: Record<string, unknown>;
  attendeePatch?: Record<string, unknown>;
  claimPayload?: Record<string, unknown>;
  guestHeaders: string[];
  accessCodeRequests: number;
  accessCodeVerifications: number;
  rejectedOtpAttempts: number;
}

function json(route: Route, data: unknown, status = 200) {
  const body =
    status >= 400 && data && typeof data === 'object'
      ? { success: false, ...(data as Record<string, unknown>) }
      : { success: true, data };
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

function registrationSnapshot(
  state: MockCheckoutState,
  quantity: number,
  attendees: Array<Record<string, unknown>>,
) {
  return {
    id: REGISTRATION_ID,
    referenceNumber: REFERENCE_NUMBER,
    status: state.status,
    isFree: false,
    eventId: EVENT_ID,
    tierId: TIER_ID,
    tierName: 'General Admission',
    unitPrice: 1100,
    attendeeCount: quantity,
    subtotal: 1100 * quantity,
    fees: 50,
    total: 1100 * quantity + 50,
    discount: 0,
    referralCode: null,
    currency: 'PHP',
    notes: null,
    rejectionReason: null,
    createdAt: '2026-07-31T01:00:00.000Z',
    updatedAt: '2026-07-31T01:00:00.000Z',
    event: {
      title: event.title,
      slug: event.slug,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      venue: event.venue,
      address: event.address,
      landmark: null,
      imageUrl: null,
      bankName: null,
      bankAccountNumber: null,
      bankAccountName: null,
      gcashNumber: null,
      paymentMethods: event.paymentMethods,
    },
    attendees,
    proofs:
      state.status === 'pending_payment'
        ? []
        : [{ id: 'proof-qa', status: 'pending', uploadedAt: '2026-07-31T01:05:00.000Z' }],
  };
}

async function installCheckoutApi(page: Page, options: MockCheckoutOptions = {}) {
  const quantity = options.quantity ?? 1;
  const state: MockCheckoutState = {
    status: options.beginWithProofSubmitted ? 'proof_submitted' : 'pending_payment',
    confirmationCodeRequests: 0,
    guestHeaders: [],
    accessCodeRequests: 0,
    accessCodeVerifications: 0,
    rejectedOtpAttempts: 0,
  };
  let attendees: Array<Record<string, unknown>> =
    options.authenticated && quantity === 1
      ? [
          {
            id: 'attendee-auth-1',
            firstName: 'Ada',
            lastName: 'Lovelace',
            email: 'ada@example.com',
            phone: '+639171234567',
            company: null,
            jobTitle: null,
            birthday: null,
            gender: null,
            city: null,
            isLead: true,
            hasQr: false,
            checkedInAt: null,
          },
        ]
      : [];

  await page.route(API_PATTERN, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const path = url.pathname;

    if (path.endsWith(`/events/${EVENT_SLUG}`) && method === 'GET') return json(route, event);
    if (path.endsWith('/funnel/events')) return json(route, { accepted: true }, 201);

    if (path.endsWith('/auth/refresh') && method === 'POST') {
      return json(route, { accessToken: 'qa-access-token', refreshToken: 'qa-refresh-token' });
    }
    if (path.endsWith('/auth/me') && method === 'GET') {
      return json(route, {
        id: 'user-qa-001',
        email: 'ada@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        isAdmin: false,
        isOrganizer: false,
        isVerified: true,
      });
    }
    if (path.endsWith('/users/me') && method === 'GET') {
      return json(route, {
        id: 'user-qa-001',
        email: 'ada@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        phone: '+639171234567',
        company: 'Analytical Engines',
        jobTitle: 'Engineer',
        birthday: null,
        gender: null,
        city: 'Davao City',
      });
    }
    if (path.endsWith('/auth/request-access') && method === 'POST') {
      state.accessCodeRequests += 1;
      return json(route, { userId: 'user-account-qa' });
    }
    if (path.endsWith('/auth/verify-access') && method === 'POST') {
      state.accessCodeVerifications += 1;
      const payload = request.postDataJSON() as { otp?: string };
      if (options.rejectFirstOtp && state.rejectedOtpAttempts === 0) {
        state.rejectedOtpAttempts += 1;
        return json(route, { message: 'Incorrect code. Please try again.' }, 400);
      }
      return json(route, {
        user: {
          id: 'user-account-qa',
          email: 'account@example.com',
          firstName: 'Katherine',
          lastName: 'Johnson',
          isAdmin: false,
          isOrganizer: false,
          isVerified: true,
        },
        accessToken: 'qa-account-access-token',
        refreshToken: 'qa-account-refresh-token',
        isNewUser: false,
        isExistingAccount: true,
      });
    }

    if (path.endsWith('/registrations/guest-intent') && method === 'POST') {
      return json(
        route,
        {
          ...registrationSnapshot(state, quantity, attendees),
          guestAccessToken: GUEST_TOKEN,
        },
        201,
      );
    }

    const guestRegistrationPath = `/registrations/guest/${REGISTRATION_ID}`;
    if (path.endsWith(`${guestRegistrationPath}/check-duplicates`) && method === 'POST') {
      state.guestHeaders.push(request.headers()['x-registration-token'] ?? '');
      return json(route, {
        conflicts: options.duplicateConflict
          ? [
              {
                email: 'g***@example.com',
                attendeeName: 'G*** T***',
                transactionDate: '2026-07-30T02:00:00.000Z',
                referenceNumber: 'AXN-****-0042',
              },
            ]
          : [],
      });
    }
    if (path.endsWith(`${guestRegistrationPath}/request-confirmation-code`) && method === 'POST') {
      state.guestHeaders.push(request.headers()['x-registration-token'] ?? '');
      state.confirmationCodeRequests += 1;
      return json(route, { message: 'Code sent' }, 201);
    }
    if (path.endsWith(`${guestRegistrationPath}/confirm`) && method === 'POST') {
      state.guestHeaders.push(request.headers()['x-registration-token'] ?? '');
      state.confirmPayload = request.postDataJSON() as Record<string, unknown>;
      const otp = state.confirmPayload.otp;
      if (options.rejectFirstOtp && state.rejectedOtpAttempts === 0) {
        state.rejectedOtpAttempts += 1;
        return json(route, { message: 'Incorrect code. Please try again.' }, 400);
      }
      expect(otp).toBe('123456');
      const submittedAttendees = state.confirmPayload.attendees;
      if (Array.isArray(submittedAttendees)) {
        attendees = submittedAttendees.map((attendee, index) => ({
          ...(attendee as Record<string, unknown>),
          id: `attendee-guest-${index + 1}`,
          isLead: index === 0,
          hasQr: false,
          checkedInAt: null,
        }));
      }
      state.status = 'pending_approval';
      return json(route, { referenceNumber: REFERENCE_NUMBER });
    }
    if (path.endsWith(guestRegistrationPath) && method === 'GET') {
      state.guestHeaders.push(request.headers()['x-registration-token'] ?? '');
      return json(route, registrationSnapshot(state, quantity, attendees));
    }

    if (path.endsWith('/payment-proofs/guest') && method === 'POST') {
      state.guestHeaders.push(request.headers()['x-registration-token'] ?? '');
      state.status = 'proof_submitted';
      return json(route, { imageUrl: 'https://example.test/proof.png' }, 201);
    }
    if (path.endsWith('/payment-proofs') && method === 'POST') {
      state.status = 'proof_submitted';
      return json(route, { imageUrl: 'https://example.test/proof.png' }, 201);
    }

    if (path.endsWith(`/registrations/${REGISTRATION_ID}/attendees`) && method === 'PATCH') {
      state.attendeePatch = request.postDataJSON() as Record<string, unknown>;
      const submittedAttendees = state.attendeePatch.attendees;
      if (Array.isArray(submittedAttendees))
        attendees = submittedAttendees as Array<Record<string, unknown>>;
      state.status = 'pending_approval';
      return json(route, registrationSnapshot(state, quantity, attendees));
    }
    if (
      path.endsWith(`/registrations/${REGISTRATION_ID}/claim-and-complete`) &&
      method === 'PATCH'
    ) {
      state.claimPayload = request.postDataJSON() as Record<string, unknown>;
      const submittedAttendees = state.claimPayload.attendees;
      if (Array.isArray(submittedAttendees))
        attendees = submittedAttendees as Array<Record<string, unknown>>;
      state.status = 'pending_approval';
      return json(route, { referenceNumber: REFERENCE_NUMBER });
    }
    if (path.endsWith(`/registrations/${REGISTRATION_ID}`) && method === 'GET') {
      return json(route, registrationSnapshot(state, quantity, attendees));
    }
    if (path.endsWith('/users/me') && method === 'PATCH') return json(route, { updated: true });

    return json(route, { message: `Unhandled QA API route: ${method} ${path}` }, 501);
  });

  return state;
}

async function choosePaymentProof(page: Page) {
  await page.getByLabel('Upload payment proof image').setInputFiles({
    name: 'payment-proof.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await page.getByRole('button', { name: 'Upload payment proof', exact: true }).click();
}

async function fillStandardGuestAttendee(page: Page) {
  await page.getByLabel('Email *', { exact: true }).fill('guest@example.com');
  await page.getByLabel('First Name *', { exact: true }).fill('Grace');
  await page.getByLabel('Last Name *', { exact: true }).fill('Tester');
}

async function fillGuestAttendee(
  page: Page,
  index: number,
  attendee: { email: string; firstName: string; lastName: string },
) {
  await page.locator(`#attendee-${index}-guest-email`).fill(attendee.email);
  await page.locator(`#attendee-${index}-guest-first-name`).fill(attendee.firstName);
  await page.locator(`#attendee-${index}-guest-last-name`).fill(attendee.lastName);
}

async function openSubmittedGuestCheckout(page: Page, options: MockCheckoutOptions = {}) {
  await page.addInitScript(
    ({ registrationId, token }) => {
      window.sessionStorage.setItem(`axon_guest_registration_${registrationId}`, token);
    },
    { registrationId: REGISTRATION_ID, token: GUEST_TOKEN },
  );
  const state = await installCheckoutApi(page, { ...options, beginWithProofSubmitted: true });
  await page.goto(
    `/events/${EVENT_SLUG}/register?registrationId=${REGISTRATION_ID}&tierId=${TIER_ID}&qty=${options.quantity ?? 1}&guest=1`,
  );
  await expect(page.getByRole('heading', { name: 'Payment proof received' })).toBeVisible();
  return state;
}

test.describe('Critical checkout journeys', () => {
  test('@critical paid guest checkout is payment-first, OTP-locked, and stores only transaction data', async ({
    page,
    diagnostics,
  }) => {
    const state = await installCheckoutApi(page);

    await page.goto(`/events/${EVENT_SLUG}/register?tierId=${TIER_ID}&qty=1`);
    await expect(page).toHaveURL(new RegExp(`/register/payment/${REGISTRATION_ID}$`));
    await expect(page.getByRole('navigation', { name: 'Checkout progress' })).toContainText(
      'Payment & Proof',
    );
    await expect(page.getByRole('heading', { name: 'Complete Your Payment' })).toBeVisible();
    await expect(page.getByText('₱1,150')).toBeVisible();
    await expect(page.getByText(/ask for the attendee details/i)).toBeVisible();

    await choosePaymentProof(page);

    await expect(page.getByRole('heading', { name: 'Payment proof received' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Continue as Guest/i })).toBeVisible();
    await expect(page.getByText(/No Axon account or profile will be created/i)).toBeVisible();
    await page.getByRole('button', { name: /Continue as Guest/i }).click();

    await expect(page.getByRole('heading', { name: /Attendee 1/i })).toBeVisible();
    await expect(page.locator('form input:not([type="hidden"])')).toHaveCount(3);
    await fillStandardGuestAttendee(page);
    await page.getByRole('button', { name: 'Review Transaction Details' }).click();

    await expect(page.getByRole('heading', { name: 'Order Summary' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Attendee Details' })).toBeVisible();
    await expect(page.getByText('Grace Tester')).toBeVisible();
    await expect(page.getByText(/without creating an account/i)).toBeVisible();
    await page.getByRole('button', { name: 'Confirm and Send My Code' }).click();

    await expect(page.getByRole('heading', { name: 'Confirm your email' })).toBeVisible();
    expect(state.confirmationCodeRequests).toBe(1);
    await page.getByLabel('Six-digit confirmation code').fill('123456');

    await expect(page).toHaveURL(/register\/complete\?/);
    await expect(page.getByRole('heading', { name: 'Transaction submitted' })).toBeVisible();
    await expect(page.getByText(/within 1–2 business days/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create or connect account' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Skip for now' })).toBeVisible();

    const submittedAttendees = state.confirmPayload?.attendees as Array<Record<string, unknown>>;
    expect(submittedAttendees).toEqual([
      { firstName: 'Grace', lastName: 'Tester', email: 'guest@example.com' },
    ]);
    expect(state.guestHeaders).not.toContain('');
    expectNoBrowserFailures(diagnostics);
  });

  test('@critical guest duplicate protection blocks confirmation before sending an OTP', async ({
    page,
    diagnostics,
  }) => {
    const state = await openSubmittedGuestCheckout(page, { duplicateConflict: true });
    await page.getByRole('button', { name: /Continue as Guest/i }).click();
    await fillStandardGuestAttendee(page);
    await page.getByRole('button', { name: 'Review Transaction Details' }).click();
    await page.getByRole('button', { name: 'Confirm and Send My Code' }).click();

    const dialog = page.getByRole('dialog', { name: /Registration protected/i });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/limits bulk purchasing by scalpers/i);
    await expect(dialog).toContainText('G*** T***');
    await expect(dialog).toContainText('AXN-****-0042');
    await expect(dialog).not.toContainText('guest@example.com');
    expect(state.confirmationCodeRequests).toBe(0);
    expectNoBrowserFailures(diagnostics);
  });

  test('@critical paid guest bulk checkout collects exactly three transaction fields per attendee', async ({
    page,
    diagnostics,
  }) => {
    const state = await openSubmittedGuestCheckout(page, { quantity: 2 });
    await page.getByRole('button', { name: /Continue as Guest/i }).click();

    await expect(page.getByText(/every ticket receives its own named QR code/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /Attendee 1/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Attendee 2/i })).toBeVisible();
    await expect(page.locator('form input:not([type="hidden"])')).toHaveCount(6);

    await fillGuestAttendee(page, 1, {
      email: 'lead@example.com',
      firstName: 'Lead',
      lastName: 'Registrant',
    });
    await fillGuestAttendee(page, 2, {
      email: 'friend@example.com',
      firstName: 'Second',
      lastName: 'Attendee',
    });
    await page.getByRole('button', { name: 'Review Transaction Details' }).click();
    await expect(page.getByText('Lead Registrant')).toBeVisible();
    await expect(page.getByText('Second Attendee')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm and Send My Code' }).click();
    await page.getByLabel('Six-digit confirmation code').fill('123456');

    await expect(page).toHaveURL(/register\/complete\?/);
    const submittedAttendees = state.confirmPayload?.attendees as Array<Record<string, unknown>>;
    expect(submittedAttendees).toEqual([
      { firstName: 'Lead', lastName: 'Registrant', email: 'lead@example.com' },
      { firstName: 'Second', lastName: 'Attendee', email: 'friend@example.com' },
    ]);
    expect(state.confirmationCodeRequests).toBe(1);
    expectNoBrowserFailures(diagnostics);
  });

  test('@critical guest OTP failure keeps the transaction unlocked and allows a valid retry', async ({
    page,
    diagnostics,
  }) => {
    const state = await openSubmittedGuestCheckout(page, { rejectFirstOtp: true });
    await page.getByRole('button', { name: /Continue as Guest/i }).click();
    await fillStandardGuestAttendee(page);
    await page.getByRole('button', { name: 'Review Transaction Details' }).click();
    await page.getByRole('button', { name: 'Confirm and Send My Code' }).click();

    await page.getByLabel('Six-digit confirmation code').fill('000000');
    await expect(page.getByRole('alert').filter({ hasText: 'Incorrect code' })).toContainText(
      'Incorrect code',
    );
    await expect(page).not.toHaveURL(/register\/complete/);
    await page.getByLabel('Six-digit confirmation code').fill('123456');

    await expect(page).toHaveURL(/register\/complete\?/);
    expect(state.rejectedOtpAttempts).toBe(1);
    // Chromium reports an expected HTTP 400 response as a console error. The
    // UI assertion above proves that this response was handled, so remove only
    // that known diagnostic before enforcing the no-unhandled-errors guard.
    const handledBadRequest = diagnostics.consoleErrors.findIndex((message) =>
      message.includes('400 (Bad Request)'),
    );
    if (handledBadRequest >= 0) diagnostics.consoleErrors.splice(handledBadRequest, 1);
    expectNoBrowserFailures(diagnostics);
  });

  test('@critical logged-in single-ticket checkout skips attendee entry and does not request another OTP', async ({
    page,
    diagnostics,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('axon_tickets_rt', 'qa-refresh-token');
      window.localStorage.setItem('axon_tickets_portal', 'customer');
    });
    const state = await installCheckoutApi(page, { authenticated: true });

    await page.goto(`/events/${EVENT_SLUG}/register/payment/${REGISTRATION_ID}`);
    await expect(page.getByRole('heading', { name: 'Complete Your Payment' })).toBeVisible();
    await choosePaymentProof(page);

    const progress = page.getByRole('navigation', { name: 'Checkout progress' });
    await expect(progress).toContainText('Payment & Proof');
    await expect(progress).toContainText('Confirmation');
    await expect(progress).not.toContainText('Attendee Details');
    await expect(page.getByRole('heading', { name: 'Registrant Details' })).toBeVisible();
    await expect(page.getByText('Ada Lovelace')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirm Transaction' })).toBeVisible();
    await expect(page.getByLabel('Six-digit confirmation code')).toHaveCount(0);

    await page.getByRole('button', { name: 'Confirm Transaction' }).click();
    await expect(page).toHaveURL(/register\/complete\?/);
    await expect(page.getByRole('heading', { name: 'Transaction submitted' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'View My Registration' })).toBeVisible();
    expect(state.confirmationCodeRequests).toBe(0);
    expect(state.attendeePatch).toBeDefined();
    expectNoBrowserFailures(diagnostics);
  });

  test('@critical logged-in bulk checkout keeps attendee entry and never requests another OTP', async ({
    page,
    diagnostics,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('axon_tickets_rt', 'qa-refresh-token');
      window.localStorage.setItem('axon_tickets_portal', 'customer');
    });
    const state = await installCheckoutApi(page, { authenticated: true, quantity: 2 });

    await page.goto(`/events/${EVENT_SLUG}/register/payment/${REGISTRATION_ID}?qty=2`);
    await choosePaymentProof(page);

    const progress = page.getByRole('navigation', { name: 'Checkout progress' });
    await expect(progress).toContainText('Payment & Proof');
    await expect(progress).toContainText('Attendee Details');
    await expect(progress).toContainText('Confirmation');
    await expect(page.getByText(/every ticket receives its own named QR code/i)).toBeVisible();

    const attendeeCards = page
      .locator('form')
      .locator('div.rounded-2xl')
      .filter({ has: page.locator('h3') });
    const secondCard = attendeeCards.filter({ hasText: 'Attendee 2' });
    const secondInputs = secondCard.locator('input');
    await secondInputs.nth(0).fill('Second');
    await secondInputs.nth(1).fill('Attendee');
    await secondInputs.nth(2).fill('friend@example.com');
    await secondInputs.nth(3).fill('friend@example.com');
    await secondInputs.nth(4).fill('+639181234567');

    await page.getByRole('button', { name: 'Review Transaction Details' }).click();
    await expect(page.getByText('Ada Lovelace')).toBeVisible();
    await expect(page.getByText('Second Attendee')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm Transaction' }).click();

    await expect(page).toHaveURL(/register\/complete\?/);
    expect(state.confirmationCodeRequests).toBe(0);
    expect(state.attendeePatch?.attendees).toHaveLength(2);
    expectNoBrowserFailures(diagnostics);
  });

  test('@critical account checkout verifies at final confirmation before linking the order', async ({
    page,
    diagnostics,
  }) => {
    const state = await openSubmittedGuestCheckout(page);
    await page.getByRole('button', { name: /Sign In or Activate an Account/i }).click();

    await expect(page.getByText(/checks and links this email only after/i)).toBeVisible();
    const form = page.locator('form');
    const accountInputs = form.locator('input');
    await accountInputs.nth(0).fill('account@example.com');
    await accountInputs.nth(1).fill('account@example.com');
    await accountInputs.nth(2).fill('Katherine');
    await accountInputs.nth(3).fill('Johnson');
    await accountInputs.nth(4).fill('+639171234567');

    await page.getByRole('button', { name: 'Review Transaction Details' }).click();
    await expect(page.getByText('Katherine Johnson')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm and Send My Code' }).click();
    await expect(page.getByRole('heading', { name: 'Confirm your email' })).toBeVisible();
    expect(state.accessCodeRequests).toBe(1);
    expect(state.claimPayload).toBeUndefined();

    await page.getByLabel('Six-digit confirmation code').fill('123456');
    await expect(page).toHaveURL(/scenario=account/);
    expect(state.accessCodeVerifications).toBe(1);
    expect(state.claimPayload?.attendees).toHaveLength(1);
    expectNoBrowserFailures(diagnostics);
  });
});

test('@smoke customer login opens the merged email-first OTP screen', async ({
  page,
  diagnostics,
}) => {
  await page.goto('/auth/login?redirect=/account/tickets');

  await expect(page).toHaveURL(/\/auth\/access\?redirect=%2Faccount%2Ftickets/);
  await expect(page.getByRole('heading', { name: 'Enter Email' })).toBeVisible();
  await expect(page.getByLabel('Email address')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send my code' })).toBeDisabled();
  await expect(page.getByText(/new or returning, it works the same way/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Terms & Conditions' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Privacy Policy' })).toBeVisible();
  expectNoBrowserFailures(diagnostics);
});
