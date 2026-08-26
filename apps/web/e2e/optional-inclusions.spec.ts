import { expect, test } from '@playwright/test';

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
