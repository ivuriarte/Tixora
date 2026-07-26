import { expect, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'https://api-uat.axontickets.online';

test.describe('Release 2.0 discovery', () => {
  test('renders all approved time-based sections and category filters', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Happening Now' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Happening Soon' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Upcoming Events' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Events You Missed' })).toBeVisible();

    const categories = page.getByRole('navigation', { name: 'Event categories' });
    for (const label of ['All', 'sports', 'business', 'workshops', 'music', 'theater', 'parties']) {
      await expect(categories.getByRole('link', { name: label, exact: true })).toBeVisible();
    }
  });

  test('search and category filtering preserve a stable empty/result state', async ({ page }) => {
    await page.goto('/?category=sports&q=nonexistent-release-two-event#events');

    await expect(
      page.getByRole('navigation', { name: 'Event categories' }).getByRole('link', {
        name: 'sports',
        exact: true,
      }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('search').getByRole('textbox')).toHaveValue(
      'nonexistent-release-two-event',
    );
    await expect(page.getByText(/No events in this section/i).first()).toBeVisible();
  });

  test('discovery API sections are mutually exclusive and expose the approved contract', async ({
    request,
  }) => {
    const response = await request.get(`${API_URL}/api/v1/events/discovery`);
    expect(response.status()).toBe(200);
    const json = await response.json();
    const discovery = json.data ?? json;

    expect(discovery.categories).toEqual([
      'all',
      'sports',
      'business',
      'workshops',
      'music',
      'theater',
      'parties',
    ]);
    const sectionNames = [
      'happeningNow',
      'happeningSoon',
      'upcomingEvents',
      'eventsYouMissed',
    ] as const;
    const seen = new Set<string>();
    for (const sectionName of sectionNames) {
      expect(Array.isArray(discovery.sections[sectionName])).toBe(true);
      for (const event of discovery.sections[sectionName]) {
        expect(seen.has(event.id)).toBe(false);
        seen.add(event.id);
        expect(Array.isArray(event.labels)).toBe(true);
      }
    }
    expect(discovery.sections.hottestRightNow.length).toBeLessThanOrEqual(6);
    expect(
      discovery.sections.hottestRightNow.length === 0 ||
        discovery.sections.hottestRightNow.length >= 3,
    ).toBe(true);
  });
});

test.describe('Release 2.0 manual guest registration', () => {
  test('offers guest checkout and explicit consent-based account activation', async ({
    page,
    request,
  }) => {
    // The production build runs on localhost during QA while the real browser
    // deployment runs at uat.axontickets.online. Proxy UAT API responses with
    // the local test origin; the live UAT-origin preflight is verified
    // separately in the release security checks.
    await page.route(`${API_URL}/**`, async (route) => {
      const upstream = await request.fetch(route.request());
      await route.fulfill({
        response: upstream,
        headers: {
          ...upstream.headers(),
          'access-control-allow-origin': 'http://localhost:3100',
          'access-control-allow-credentials': 'true',
        },
      });
    });

    const eventsResponse = await request.get(`${API_URL}/api/v1/events?page=1&limit=1`);
    const eventsJson = await eventsResponse.json();
    const list = eventsJson.data ?? eventsJson;
    const eventSummary = list.data[0];
    expect(eventSummary).toBeTruthy();

    const eventResponse = await request.get(`${API_URL}/api/v1/events/${eventSummary.slug}`);
    const eventJson = await eventResponse.json();
    const event = eventJson.data ?? eventJson;
    const tier = event.tiers[0];
    expect(tier).toBeTruthy();

    await page.goto(`/events/${event.slug}/register?tierId=${tier.id}&qty=1`);

    await expect(page.getByRole('heading', { name: 'Choose how to continue' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Continue without an account/i })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Sign in or activate an account/i }),
    ).toBeVisible();
    await expect(page.getByText(/never activate one without your consent/i)).toBeVisible();
    await expect(page.getByText(/credit card|saved card|promo code/i)).toHaveCount(0);
  });
});
