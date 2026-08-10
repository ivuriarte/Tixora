import type { BrowserContext, Route } from '@playwright/test';

const event = {
  id: 'event-qa',
  slug: 'qa-event-2030',
  title: 'QA Event 2030',
  description: 'A deterministic event used only by the Playwright admin UI suite.',
  imageUrl: '/og-image.png',
  category: 'business',
  eventType: 'standard',
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

const admin = {
  id: 'admin-qa',
  email: 'admin-automation@invalid.axontickets.test',
  firstName: 'Automation',
  lastName: 'Admin',
  isAdmin: true,
  isOrganizer: false,
  isVerified: true,
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
    if (method === 'GET' && path === '/admin/events') {
      return json(route, {
        data: [event],
        meta: { total: 1, page: 1, limit: 100, totalPages: 1 },
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
      return json(route, { data: [] });
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
