import type { BrowserContext, Route } from '@playwright/test';

const event = {
  id: 'event-qa',
  slug: 'qa-event-2030',
  title: 'QA Event 2030',
  description: 'A deterministic event used only by the Playwright admin UI suite.',
  imageUrl: null,
  category: 'business',
  eventType: 'standard',
  runningConfig: null,
  isOnline: false,
  venue: 'QA Convention Hall',
  address: '123 QA Street',
  city: 'Davao City',
  latitude: 7.0707,
  longitude: 125.6087,
  startsAt: '2030-01-10T02:00:00.000Z',
  endsAt: '2030-01-10T04:00:00.000Z',
  maxPerUser: 2,
  maxCapacity: 100,
  isFree: true,
  platformFee: 0,
  status: 'on_sale',
  onsiteRegistrationEnabled: true,
  access: { role: 'platform_admin', canManageEvent: true },
  ticketsSold: 10,
  organization: { id: 'org-qa', name: 'QA Events' },
  agenda: [],
  sponsors: [],
  faqs: [],
  customSections: [],
  paymentMethods: [],
  tiers: [
    {
      id: 'tier-qa',
      name: 'General Admission',
      description: null,
      price: 0,
      totalQuantity: 100,
      soldQuantity: 10,
      maxPerOrder: 2,
      isVisible: true,
      sortOrder: 0,
      inclusions: [],
    },
  ],
};

const runningEvent = {
  ...event,
  id: 'event-running-qa',
  slug: 'qa-run-2030',
  title: 'QA Run 2030',
  category: 'sports',
  eventType: 'running',
  isFree: false,
  platformFee: 50,
  runningConfig: {
    distances: [
      { name: '5K', code: '5K' },
      { name: '10K', code: '10K' },
    ],
    ageGroups: [
      { name: 'Junior', minAge: 12, maxAge: 17 },
      { name: 'Open', minAge: 18, maxAge: 99 },
    ],
    raceDivisions: ['Open'],
    genderIdentityOptions: ['Prefer not to say'],
    merchandiseSizes: ['M'],
    claimMethods: ['pickup'],
  },
};

const admin = {
  id: 'admin-qa',
  email: 'admin-automation@invalid.axontickets.test',
  firstName: 'Automation',
  lastName: 'Admin',
  isAdmin: true,
  isOrganizer: false,
  isVerified: true,
};

const onsiteAttendee = {
  id: 'attendee-onsite-qa',
  userEmail: 'walkin@example.com',
  userName: 'Walkin Attendee',
  userCompany: 'Axon QA',
  userJobTitle: 'Tester',
  userCity: 'Davao City',
  userPhone: '+639171234567',
  subEvents: 'Opening Plenary',
  tierName: 'General Admission',
  orderStatus: null,
  paymentMethod: 'onsite_qr',
  status: 'used',
  checkedInAt: '2030-01-10T02:15:00.000Z',
  raceDistance: null,
  raceDivision: null,
  genderIdentity: null,
  merchandiseSize: null,
  bibNumber: null,
  claimMethod: null,
  claimedAt: null,
};

const runningAttendee = {
  ...onsiteAttendee,
  id: 'attendee-running-qa',
  userEmail: 'runner@example.com',
  userName: 'River Runner',
  subEvents: null,
  tierName: '5K',
  orderStatus: 'paid',
  status: 'valid',
  checkedInAt: null,
  raceDistance: '5K',
  raceDivision: 'Open',
  genderIdentity: 'Prefer not to say',
  merchandiseSize: 'M',
  bibNumber: '5K-0001',
  claimMethod: 'pickup',
  claimedAt: null,
};

const organizer = {
  id: 'org-qa',
  name: 'QA Events',
  description: 'Deterministic organizer fixture.',
  website: null,
  city: 'Davao City',
  approvalStatus: 'approved',
  isPublic: true,
  hiddenAt: null,
  rejectionReason: null,
  contactName: 'Organizer Owner',
  organizationType: 'Company',
  registrationNumber: null,
  idType: 'Government ID',
  idNumber: 'QA-REDACTED',
  phone: '+639171234567',
  facebookUrl: null,
  createdBy: { id: 'organizer-owner', email: 'owner@example.com', name: 'Organizer Owner' },
  approvedBy: { id: admin.id, email: admin.email },
  approvedAt: '2029-12-01T00:00:00.000Z',
  rejectedAt: null,
  memberCount: 1,
  members: [],
  createdAt: '2029-11-20T00:00:00.000Z',
  updatedAt: '2029-12-01T00:00:00.000Z',
};

function envelope(data: unknown) {
  return { success: true, data };
}

async function json(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(envelope(data)),
  });
}

export async function installAdminApiMocks(context: BrowserContext) {
  await context.route(/\/api\/v1\/.*/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^.*\/api\/v1/, '');
    const method = request.method();

    if (method === 'POST' && path === '/auth/refresh') {
      return json(route, {
        accessToken: 'qa-access-token',
        refreshToken: 'qa-refresh-token-rotated',
      });
    }
    if (method === 'GET' && path === '/auth/me') return json(route, admin);
    if (method === 'GET' && path === '/admin/verifications/count') {
      return json(route, { count: 0 });
    }
    if (method === 'GET' && path === '/admin/organizers/count') {
      return json(route, { count: 0 });
    }
    if (method === 'GET' && path === '/admin/organizers') {
      return json(route, {
        data: [organizer],
        meta: {
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        },
      });
    }
    if (method === 'GET' && path === `/admin/organizers/${organizer.id}`) {
      return json(route, organizer);
    }
    if (method === 'PATCH' && path === `/admin/organizers/${organizer.id}/profile-visibility`) {
      const body = request.postDataJSON() as { visible: boolean };
      return json(route, {
        id: organizer.id,
        visible: body.visible,
        hiddenAt: body.visible ? null : new Date().toISOString(),
      });
    }
    if (method === 'GET' && path === '/admin/analytics/executive') {
      return json(route, {
        contractVersion: '2.1',
        generatedAt: '2030-01-15T00:00:00.000Z',
        range: {
          from: '2030-01-01T00:00:00.000Z',
          to: '2030-01-15T00:00:00.000Z',
          granularity: 'day',
          timeZone: 'Asia/Manila',
        },
        metrics: {
          totalOrganizers: 1,
          activeOrganizers: 1,
          inactiveOrganizers: 0,
          overallEvents: 1,
          activeEvents: 1,
          finishedEvents: 0,
          totalUserAccounts: 50,
          successfulTransactions: 10,
          ticketsIssued: 12,
          grossSales: 5500,
          refunds: 0,
          netSales: 5500,
          platformFees: 500,
          averageOrderValue: 550,
          averageSpendPerPayingUser: 550,
          averageCustomerAge: 29.5,
          ageDataCoverage: 0.8,
        },
        timeline: [
          {
            period: '2030-01-10',
            grossSales: 5500,
            refunds: 0,
            netSales: 5500,
            transactions: 10,
            ticketsIssued: 12,
          },
        ],
        organizerPerformance: [
          {
            organizerId: 'org-qa',
            organizerName: 'QA Events',
            successfulTransactions: 10,
            ticketsIssued: 12,
            grossSales: 5500,
            refunds: 0,
            netSales: 5500,
          },
        ],
      });
    }
    if (method === 'GET' && path === '/admin/analytics/executive/export') {
      await route.fulfill({
        status: 200,
        contentType: 'text/csv; charset=utf-8',
        body: 'Metric,Value\n"grossSales","5500"',
      });
      return;
    }
    if (method === 'GET' && path === '/admin/users') {
      return json(route, {
        data: [
          { ...admin, createdAt: '2029-01-01T00:00:00.000Z' },
          {
            id: 'user-qa',
            email: 'customer@example.com',
            firstName: 'Customer',
            lastName: 'Tester',
            isAdmin: false,
            isVerified: true,
            createdAt: '2029-02-01T00:00:00.000Z',
          },
        ],
        total: 2,
        page: 1,
        limit: 50,
      });
    }
    if (method === 'GET' && path === '/admin/settings/platform') {
      return json(route, { serviceFee: 50 });
    }
    if (method === 'GET' && path === '/admin/events') {
      return json(route, {
        data: [event, runningEvent],
        meta: { total: 2, page: 1, limit: 100, totalPages: 1 },
      });
    }
    if (method === 'GET' && path === '/admin/analytics/dashboard') {
      return json(route, {
        totalRegistrations: 10,
        paidOrders: 10,
        pendingOrders: 0,
        checkedInTickets: 4,
        verifiedRegistrations: 10,
        pendingRegistrations: 0,
        checkedInAttendees: 4,
        totalCheckedIn: 4,
        grossRevenue: 0,
      });
    }
    if (method === 'GET' && path === `/admin/events/${event.id}`) {
      return json(route, event);
    }
    if (method === 'GET' && path === `/admin/events/${runningEvent.id}`) {
      return json(route, runningEvent);
    }
    if (method === 'GET' && path === `/admin/events/${event.id}/workspace`) {
      return json(route, null);
    }
    if (method === 'GET' && path === `/admin/events/${event.id}/referral-codes`) {
      return json(route, []);
    }
    if (method === 'GET' && path === '/admin/orders') {
      return json(route, {
        data: [],
        meta: {
          total: 0,
          page: 1,
          limit: 20,
          totalPages: 0,
          hasNextPage: false,
          hasPrevPage: false,
        },
      });
    }
    if (method === 'GET' && path === '/admin/checkin/search') {
      return json(route, {
        data: [
          {
            id: onsiteAttendee.id,
            firstName: 'Walkin',
            lastName: 'Attendee',
            email: onsiteAttendee.userEmail,
            tierName: onsiteAttendee.tierName,
            referenceNumber: 'AXN-ONSITE-QA',
            eventTitle: event.title,
            registrationStatus: 'verified',
            checkedInAt: onsiteAttendee.checkedInAt,
            firstCheckedInAt: onsiteAttendee.checkedInAt,
            hasQr: true,
          },
        ],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      });
    }
    if (method === 'GET' && path === `/admin/events/${event.id}/attendees`) {
      return json(route, {
        data: [onsiteAttendee],
        meta: {
          total: 1,
          page: 1,
          limit: 50,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        },
      });
    }
    if (method === 'GET' && path === `/admin/events/${event.id}/merchandise-summary`) {
      return json(route, []);
    }
    if (method === 'GET' && path === `/admin/events/${runningEvent.id}/attendees`) {
      return json(route, {
        data: [runningAttendee],
        meta: {
          total: 1,
          page: 1,
          limit: 50,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        },
      });
    }
    if (method === 'GET' && path === `/admin/events/${runningEvent.id}/merchandise-summary`) {
      return json(route, [
        {
          distance: '5K',
          raceDivision: 'Open',
          size: 'M',
          registered: 1,
          claimed: 0,
          remaining: 1,
        },
      ]);
    }
    if (
      method === 'GET' &&
      path === `/admin/events/${runningEvent.id}/merchandise-summary/export`
    ) {
      return route.fulfill({
        status: 200,
        contentType: 'text/csv',
        body: 'Distance,Race Division,Size,Registered,Claimed,Remaining\n5K,Open,M,1,0,1',
      });
    }
    if (
      method === 'PATCH' &&
      path === `/admin/events/${runningEvent.id}/attendees/${runningAttendee.id}/race-distance`
    ) {
      const body = request.postDataJSON() as { distance: string; reason: string };
      return json(route, {
        ...runningAttendee,
        raceDistance: body.distance,
        bibNumber: '10K-0001',
      });
    }
    if (method === 'POST' && path === `/admin/checkin/manual/${onsiteAttendee.id}`) {
      return json(route, {
        valid: true,
        attendeeName: onsiteAttendee.userName,
        tierName: onsiteAttendee.tierName,
        eventTitle: event.title,
        checkedInAt: onsiteAttendee.checkedInAt,
        checkInDate: '2030-01-10',
        checkInMethod: 'manual',
      });
    }
    if (method === 'GET' && path === `/admin/analytics/events/${event.id}`) {
      return json(route, {
        eventId: event.id,
        eventTitle: event.title,
        totalRevenue: 0,
        totalFees: 0,
        paidOrders: 10,
        ticketsSold: 10,
        ticketCheckins: 4,
        verifiedRegistrations: 10,
        verifiedAttendees: 10,
        pendingRegistrations: 0,
        registrationCheckins: 4,
        totalSold: 10,
        totalCheckedIn: 4,
        checkInRate: 40,
        tierBreakdown: [
          {
            tierId: 'tier-qa',
            tierName: 'General Admission',
            totalQuantity: 100,
            soldQuantity: 10,
            available: 90,
            price: 0,
            revenue: 0,
            fillRate: 10,
          },
        ],
      });
    }
    if (method === 'GET' && path === `/admin/analytics/events/${event.id}/timeline`) {
      return json(route, {
        eventId: event.id,
        days: Number(url.searchParams.get('days') ?? 14),
        series: [
          {
            date: '2030-01-01',
            revenue: 0,
            orders: 1,
            registrations: 1,
            total: 1,
          },
        ],
      });
    }
    if (method === 'GET' && path === `/admin/analytics/events/${event.id}/funnel`) {
      return json(route, {
        event: { id: event.id, title: event.title, slug: event.slug },
        counts: [],
        failures: [],
      });
    }

    if (/^\/admin\//.test(path) && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return json(route, {});
    }

    return json(route, { message: `Unhandled admin mock: ${method} ${path}` }, 501);
  });
}
