import { expect, test, type Page } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'https://api-uat.axontickets.online';
const EVENT_ID = process.env.OPTIONAL_INCLUSIONS_EVENT_ID ?? '';
const EVENT_SLUG = process.env.OPTIONAL_INCLUSIONS_EVENT_SLUG ?? '';
const TIER_ID = process.env.OPTIONAL_INCLUSIONS_TIER_ID ?? '';
const hasFixture = Boolean(EVENT_ID && EVENT_SLUG && TIER_ID);

function unwrap<T>(payload: { data?: T } | T): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

async function configureProtectedWebPage(page: Page) {
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!bypassSecret) return;
  await page.context().setExtraHTTPHeaders({
    'x-vercel-protection-bypass': bypassSecret,
    'x-vercel-set-bypass-cookie': 'true',
  });
}

function withoutVercelBypass(headers: Record<string, string>): Record<string, string> {
  const sanitized = { ...headers };
  delete sanitized['x-vercel-protection-bypass'];
  delete sanitized['x-vercel-set-bypass-cookie'];
  return sanitized;
}

test.describe('Optional Inclusions v1 — UAT release gate', () => {
  test.skip(
    !hasFixture,
    'Set OPTIONAL_INCLUSIONS_EVENT_ID, OPTIONAL_INCLUSIONS_EVENT_SLUG, and OPTIONAL_INCLUSIONS_TIER_ID to run the UAT fixture gate.',
  );

  test('public catalog produces an authoritative add-on quote', async ({ request }) => {
    const catalogResponse = await request.get(
      `${API_URL}/api/v1/events/${EVENT_ID}/optional-inclusions`,
    );
    expect(catalogResponse.status()).toBe(200);

    const catalog = unwrap<
      Array<{
        id: string;
        name: string;
        eligibleTierIds: string[];
        tierEligibility?: Array<{
          tierId: string;
          maxQuantityPerRegistration?: number | null;
        }>;
        variants: Array<{
          id: string;
          price: number;
          availableQuantity: number;
          isSoldOut: boolean;
        }>;
      }>
    >(await catalogResponse.json());
    const inclusion = catalog.find(
      (item) =>
        (item.eligibleTierIds.length === 0 || item.eligibleTierIds.includes(TIER_ID)) &&
        item.variants.some((variant) => !variant.isSoldOut && variant.availableQuantity > 0),
    );
    expect(inclusion, 'UAT fixture must expose an in-stock optional inclusion').toBeTruthy();
    const variant = inclusion!.variants.find(
      (item) => !item.isSoldOut && item.availableQuantity > 0,
    )!;

    const quoteResponse = await request.post(
      `${API_URL}/api/v1/events/${EVENT_ID}/inclusion-quote`,
      {
        data: {
          tierId: TIER_ID,
          attendeeCount: 1,
          selections: [
            {
              inclusionId: inclusion!.id,
              variantId: variant.id,
              quantity: 1,
              attendeeIndex: 0,
            },
          ],
        },
      },
    );
    expect(quoteResponse.status()).toBe(201);
    const quote = unwrap<{
      token: string;
      expiresAt: string;
      admissionSubtotal: number;
      inclusionSubtotal: number;
      discount: number;
      fees: number;
      total: number;
      lineItems: Array<{ kind: string; sourceId?: string; total: number }>;
    }>(await quoteResponse.json());

    expect(quote.token).toBeTruthy();
    expect(new Date(quote.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(quote.inclusionSubtotal).toBe(variant.price);
    expect(quote.lineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'admission' }),
        expect.objectContaining({ kind: 'inclusion', sourceId: variant.id }),
      ]),
    );
    expect(quote.total).toBe(
      quote.admissionSubtotal + quote.inclusionSubtotal - quote.discount + quote.fees,
    );
  });

  test('customer pages distinguish optional add-ons from admission and onsite sales', async ({
    page,
  }) => {
    await configureProtectedWebPage(page);
    // Vercel protection applies to the web deployment only. Keeping its bypass
    // headers on cross-origin API calls would trigger a rejected CORS preflight.
    if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
      const apiOrigin = new URL(API_URL).origin;
      await page.route(`${apiOrigin}/**`, async (route) => {
        await route.continue({ headers: withoutVercelBypass(route.request().headers()) });
      });
    }

    await page.goto(`/events/${EVENT_SLUG}`);
    await expect(page.getByRole('heading', { name: 'Optional add-ons' })).toBeVisible();

    const catalogResponse = await page.request.get(
      `${API_URL}/api/v1/events/${EVENT_ID}/optional-inclusions`,
    );
    const catalog = unwrap<Array<{ name: string }>>(await catalogResponse.json());
    expect(catalog.length).toBeGreaterThan(0);
    await expect(page.getByRole('heading', { name: catalog[0].name })).toBeVisible();
    await expect(page.getByText('Add-ons are separate from admission.')).toBeVisible();

    await page.goto(`/events/${EVENT_SLUG}/onsite`);
    await expect(
      page.getByText('Optional add-ons are unavailable at on-site registration.'),
    ).toBeVisible();
  });
});

type OrganizerRole = 'owner' | 'member';

interface MockOrganizerState {
  event: {
    id: string;
    title: string;
    optionalInclusionsEnabled: boolean;
    tiers: Array<{ id: string; name: string }>;
    access: { canManageEvent: boolean; capabilities: string[] };
  };
  inclusions: Array<{
    id: string;
    name: string;
    description: string;
    status: string;
    saleStartsAt: string | null;
    saleEndsAt: string | null;
    fulfillmentMethod: string;
    fulfillmentInstructions: string;
    eligibleTierIds: string[];
    tierEligibility: Array<{ tierId: string; maxQuantityPerRegistration: number }>;
    variants: Array<{
      id: string;
      name: string;
      sku: string;
      price: number;
      totalStock: number;
      reservedStock: number;
      soldStock: number;
      isActive: boolean;
    }>;
  }>;
  fulfillments: Array<{
    id: string;
    lineItemId: string;
    registrationId: string;
    customerName: string;
    attendeeName: string;
    inclusionName: string;
    variantName: string;
    quantity: number;
    status: string;
    fulfilledAt: string | null;
  }>;
  requests: Array<{ method: string; path: string; body: unknown }>;
  sanitizedApiHeaders: Array<Record<string, string>>;
}

const MOCK_EVENT_ID = 'event-optional-inclusions';

function organizerCapabilities(role: OrganizerRole): string[] {
  return role === 'owner'
    ? [
        'inclusions.read',
        'inclusions.manage',
        'inclusions.inventory.manage',
        'inclusions.fulfill',
        'inclusions.finance.read',
        'inclusions.finance.export',
      ]
    : ['inclusions.read', 'inclusions.fulfill'];
}

async function setupOrganizerMocks(page: Page, role: OrganizerRole = 'owner') {
  await configureProtectedWebPage(page);
  await page.addInitScript(() => {
    window.localStorage.setItem('axon_tickets_rt', 'mock-refresh-token');
    window.localStorage.setItem('axon_tickets_portal', 'organizer');
  });

  const state: MockOrganizerState = {
    event: {
      id: MOCK_EVENT_ID,
      title: 'Makers Assembly 2026',
      optionalInclusionsEnabled: false,
      tiers: [
        { id: 'tier-general', name: 'General Admission' },
        { id: 'tier-vip', name: 'VIP' },
      ],
      access: {
        canManageEvent: role === 'owner',
        capabilities: organizerCapabilities(role),
      },
    },
    inclusions: [
      {
        id: 'inclusion-shirt',
        name: 'Limited event shirt',
        description: 'A numbered cotton event shirt.',
        status: 'active',
        saleStartsAt: null,
        saleEndsAt: null,
        fulfillmentMethod: 'pickup',
        fulfillmentInstructions: 'Claim at the merchandise desk.',
        eligibleTierIds: ['tier-vip'],
        tierEligibility: [{ tierId: 'tier-vip', maxQuantityPerRegistration: 2 }],
        variants: [
          {
            id: 'variant-medium',
            name: 'Medium',
            sku: 'SHIRT-M',
            price: 650,
            totalStock: 20,
            reservedStock: 2,
            soldStock: 8,
            isActive: true,
          },
        ],
      },
    ],
    fulfillments: [
      {
        id: 'fulfillment-1',
        lineItemId: 'line-item-1',
        registrationId: 'registration-1',
        customerName: 'Ari Santos',
        attendeeName: 'Ari Santos',
        inclusionName: 'Limited event shirt',
        variantName: 'Medium',
        quantity: 1,
        status: 'pending',
        fulfilledAt: null,
      },
    ],
    requests: [],
    sanitizedApiHeaders: [],
  };

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = request.method();
    const body = request.postData() ? request.postDataJSON() : undefined;
    const sanitizedHeaders = withoutVercelBypass(request.headers());
    state.sanitizedApiHeaders.push(sanitizedHeaders);
    state.requests.push({ method, path, body });

    const respond = (data: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ data }),
      });

    if (path === '/auth/refresh' && method === 'POST') {
      return respond({ accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token' });
    }
    if (path === '/auth/me' && method === 'GET') {
      return respond({
        id: 'organizer-1',
        email: 'organizer@example.com',
        firstName: 'Morgan',
        lastName: 'Reyes',
        isAdmin: false,
        isOrganizer: true,
        isVerified: true,
      });
    }
    if (path === '/admin/verifications/count' && method === 'GET') {
      return respond({ count: 0 });
    }
    if (path === `/admin/events/${MOCK_EVENT_ID}` && method === 'GET') {
      return respond(state.event);
    }
    if (
      path === `/admin/events/${MOCK_EVENT_ID}/optional-inclusions/settings` &&
      method === 'PATCH'
    ) {
      state.event.optionalInclusionsEnabled = Boolean((body as { enabled?: boolean })?.enabled);
      return respond({
        id: MOCK_EVENT_ID,
        optionalInclusionsEnabled: state.event.optionalInclusionsEnabled,
      });
    }
    if (path === `/admin/events/${MOCK_EVENT_ID}/optional-inclusions/report`) {
      return respond({
        summary: {
          inclusionRevenue: 5200,
          unitsSold: 8,
          unitsFulfilled: 5,
          unitsUnfulfilled: 3,
          attachmentRate: 40,
        },
        byInclusion: [
          {
            inclusionId: 'inclusion-shirt',
            inclusionName: 'Limited event shirt',
            unitsSold: 8,
            revenue: 5200,
            unitsFulfilled: 5,
            unitsUnfulfilled: 3,
          },
        ],
        byVariant: [
          {
            inclusionId: 'inclusion-shirt',
            inclusionName: 'Limited event shirt',
            variantId: 'variant-medium',
            variantName: 'Medium',
            unitsSold: 8,
            revenue: 5200,
            unitsFulfilled: 5,
            unitsUnfulfilled: 3,
          },
        ],
        inventory: [
          {
            inclusionId: 'inclusion-shirt',
            inclusionName: 'Limited event shirt',
            variantId: 'variant-medium',
            variantName: 'Medium',
            totalStock: 20,
            reservedStock: 2,
            soldStock: 8,
            availableStock: 10,
          },
        ],
      });
    }
    if (path === `/admin/events/${MOCK_EVENT_ID}/optional-inclusions/fulfillments`) {
      const status = url.searchParams.get('status');
      const data = status
        ? state.fulfillments.filter((item) => item.status === status)
        : state.fulfillments;
      return respond({ data, meta: { total: data.length, page: 1, limit: 100, totalPages: 1 } });
    }
    const reverseMatch = path.match(
      new RegExp(`^/admin/events/${MOCK_EVENT_ID}/optional-inclusions/fulfillments/([^/]+)/reverse$`),
    );
    if (reverseMatch && method === 'POST') {
      const item = state.fulfillments.find((entry) => entry.id === reverseMatch[1]);
      if (item) item.status = 'reversed';
      return respond(item ?? {});
    }
    const fulfillMatch = path.match(
      new RegExp(`^/admin/events/${MOCK_EVENT_ID}/optional-inclusions/fulfillments/([^/]+)$`),
    );
    if (fulfillMatch && method === 'POST') {
      const item = state.fulfillments.find((entry) => entry.lineItemId === fulfillMatch[1]);
      if (item) {
        item.status = 'fulfilled';
        item.fulfilledAt = '2026-08-27T02:00:00.000Z';
      }
      return respond(item ?? {});
    }
    const stockMatch = path.match(
      new RegExp(
        `^/admin/events/${MOCK_EVENT_ID}/optional-inclusions/([^/]+)/variants/([^/]+)/stock-adjustments$`,
      ),
    );
    if (stockMatch && method === 'POST') {
      const variant = state.inclusions
        .find((item) => item.id === stockMatch[1])
        ?.variants.find((item) => item.id === stockMatch[2]);
      if (variant) variant.totalStock += Number((body as { quantityDelta?: number })?.quantityDelta);
      return respond(variant ?? {});
    }
    const inclusionMatch = path.match(
      new RegExp(`^/admin/events/${MOCK_EVENT_ID}/optional-inclusions/([^/]+)$`),
    );
    if (inclusionMatch && method === 'PATCH') {
      const inclusion = state.inclusions.find((item) => item.id === inclusionMatch[1]);
      if (inclusion) Object.assign(inclusion, body);
      return respond(inclusion ?? {});
    }
    if (path === `/admin/events/${MOCK_EVENT_ID}/optional-inclusions` && method === 'POST') {
      const input = body as {
        name: string;
        description?: string;
        status: string;
        fulfillmentMethod: string;
        fulfillmentInstructions?: string;
        tierEligibility?: Array<{ tierId: string; maxQuantityPerRegistration: number }>;
      };
      const created = {
        id: `inclusion-${state.inclusions.length + 1}`,
        name: input.name,
        description: input.description ?? '',
        status: input.status,
        saleStartsAt: null,
        saleEndsAt: null,
        fulfillmentMethod: input.fulfillmentMethod,
        fulfillmentInstructions: input.fulfillmentInstructions ?? '',
        eligibleTierIds: (input.tierEligibility ?? []).map((entry) => entry.tierId),
        tierEligibility: input.tierEligibility ?? [],
        variants: [],
      };
      state.inclusions.push(created);
      return respond(created, 201);
    }
    if (path === `/admin/events/${MOCK_EVENT_ID}/optional-inclusions` && method === 'GET') {
      return respond(state.inclusions);
    }

    return route.continue({ headers: sanitizedHeaders });
  });

  return state;
}

test.describe('Optional Inclusions v1 — mocked organizer operations', () => {
  test('navigation, event switch, catalog creation, and tier caps use the organizer contract', async ({
    page,
  }) => {
    const state = await setupOrganizerMocks(page);
    await page.goto(`/admin/events/${MOCK_EVENT_ID}/inclusions`);

    const inclusionTab = page.getByRole('link', { name: 'Optional Inclusions' });
    await expect(inclusionTab).toHaveAttribute(
      'href',
      `/admin/events/${MOCK_EVENT_ID}/inclusions`,
    );
    await expect(inclusionTab).toHaveClass(/border-violet-600/);

    await page.getByRole('button', { name: 'Enable customer add-ons' }).click();
    await expect(page.getByText('Customer add-on sales enabled.')).toBeVisible();
    expect(
      state.requests.find(
        (request) =>
          request.path.endsWith('/optional-inclusions/settings') && request.method === 'PATCH',
      )?.body,
    ).toEqual({ enabled: true });

    await page.getByRole('button', { name: 'New inclusion' }).click();
    await page.getByLabel(/^Name/).fill('VIP workshop');
    await page.getByRole('checkbox', { name: 'VIP' }).check();
    await page.getByLabel('Max units per registration').fill('3');
    await page.getByLabel('Fulfillment method').selectOption('manual');
    await page.getByRole('button', { name: 'Create inclusion' }).click();
    await expect(page.getByText('Optional inclusion created.')).toBeVisible();

    const createRequest = state.requests.find(
      (request) =>
        request.path.endsWith('/optional-inclusions') && request.method === 'POST',
    );
    expect(createRequest?.body).toEqual(
      expect.objectContaining({
        name: 'VIP workshop',
        status: 'draft',
        fulfillmentMethod: 'manual',
        tierEligibility: [{ tierId: 'tier-vip', maxQuantityPerRegistration: 3 }],
      }),
    );
  });

  test('inventory adjustment records a signed quantity and audit reason', async ({ page }) => {
    const state = await setupOrganizerMocks(page);
    await page.goto(`/admin/events/${MOCK_EVENT_ID}/inclusions`);
    await page.getByRole('button', { name: /Inventory/ }).click();
    await page.getByRole('button', { name: 'Adjust', exact: true }).click();
    await page.getByLabel('Adjustment quantity').fill('-2');
    await page.getByLabel('Reason').fill('Two damaged shirts removed from booth stock');
    await page.getByRole('button', { name: 'Record adjustment' }).click();
    await expect(page.getByText('Stock adjustment recorded.')).toBeVisible();

    const adjustment = state.requests.find((request) =>
      request.path.endsWith('/variants/variant-medium/stock-adjustments'),
    );
    expect(adjustment?.body).toEqual({
      quantityDelta: -2,
      reason: 'Two damaged shirts removed from booth stock',
    });
  });

  test('fulfillment supports fulfill, reverse, and re-fulfill without admission check-in', async ({
    page,
  }) => {
    const state = await setupOrganizerMocks(page);
    await page.goto(`/admin/events/${MOCK_EVENT_ID}/inclusions`);
    await page.getByRole('button', { name: /Fulfillment/ }).click();

    await page.getByRole('button', { name: 'Fulfill', exact: true }).click();
    await expect(page.getByText('Inclusion fulfilled. Admission check-in was not changed.')).toBeVisible();

    await page.getByLabel('Fulfillment status').selectOption('FULFILLED');
    await page.getByRole('button', { name: 'Reverse' }).click();
    await page.getByLabel('Reason').fill('Handover was recorded against the wrong attendee');
    await page.getByRole('button', { name: 'Reverse fulfillment' }).click();
    await expect(page.getByText(/Fulfillment reversed and recorded/)).toBeVisible();

    await page.getByLabel('Fulfillment status').selectOption('REVERSED');
    await expect(page.getByText('reversed · ready to fulfill again')).toBeVisible();
    await page.getByRole('button', { name: 'Re-fulfill' }).click();
    await expect(page.getByText(/Reversed inclusion fulfilled again/)).toBeVisible();

    const fulfillmentPosts = state.requests.filter(
      (request) =>
        request.method === 'POST' &&
        request.path.endsWith('/optional-inclusions/fulfillments/line-item-1'),
    );
    expect(fulfillmentPosts).toHaveLength(2);
    expect(
      state.requests.some(
        (request) =>
          request.method === 'POST' &&
          request.path.endsWith('/optional-inclusions/fulfillments/fulfillment-1/reverse'),
      ),
    ).toBe(true);
    expect(state.requests.some((request) => request.path.includes('/checkin'))).toBe(false);
  });

  test('finance report renders separately from admission metrics', async ({ page }) => {
    await setupOrganizerMocks(page);
    await page.goto(`/admin/events/${MOCK_EVENT_ID}/inclusions`);
    await page.getByRole('button', { name: /Reports/ }).click();

    await expect(page.getByText('₱5,200.00').first()).toBeVisible();
    await expect(page.getByText('40.0%')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Limited event shirt' })).toBeVisible();
    await expect(page.getByText(/inclusion units never count as tickets/i)).toBeVisible();
  });

  test('member permissions are read-and-fulfill only', async ({ page }) => {
    await setupOrganizerMocks(page, 'member');
    await page.goto(`/admin/events/${MOCK_EVENT_ID}/inclusions`);

    await expect(page.getByRole('button', { name: 'New inclusion' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Enable customer add-ons' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Reports/ })).toHaveCount(0);

    await page.getByRole('button', { name: /Inventory/ }).click();
    await expect(page.getByRole('button', { name: 'Adjust', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: /Fulfillment/ }).click();
    await expect(page.getByRole('button', { name: 'Fulfill', exact: true })).toBeEnabled();
  });

  test('API-bound organizer traffic is stripped of Vercel protection headers', async ({ page }) => {
    const state = await setupOrganizerMocks(page);
    await page.goto(`/admin/events/${MOCK_EVENT_ID}/inclusions`);
    await expect(page.getByRole('heading', { name: 'Optional Inclusions' })).toBeVisible();
    expect(state.sanitizedApiHeaders.length).toBeGreaterThan(0);
    for (const headers of state.sanitizedApiHeaders) {
      expect(headers['x-vercel-protection-bypass']).toBeUndefined();
      expect(headers['x-vercel-set-bypass-cookie']).toBeUndefined();
    }
  });
});
