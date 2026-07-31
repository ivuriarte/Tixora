import { expect, test } from './support/qa-test';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:3001';

test.describe('Release 2.0 discovery', () => {
  test('uses the approved desktop full-bleed hero and preserves mobile event details', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const desktopCarousel = page.getByRole('region', { name: 'Featured events' });
    await expect(desktopCarousel.getByRole('link', { name: /View Event:/i })).toBeVisible();
    await expect(desktopCarousel.getByText(/Tickets from|registration required/i)).toBeHidden();
    const desktopArtwork = desktopCarousel.locator('img[alt$="featured event artwork"]:visible');
    await expect(desktopArtwork).toBeVisible();
    expect(await desktopArtwork.evaluate((image) => getComputedStyle(image).objectFit)).toBe('cover');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();

    const mobileCarousel = page.getByRole('region', { name: 'Featured events' });
    await expect(mobileCarousel.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(mobileCarousel.getByText(/Tickets from|registration required/i)).toBeVisible();
    const mobileArtwork = mobileCarousel.locator('img[alt$="featured event artwork"]:visible');
    await expect(mobileArtwork).toBeVisible();
    expect(await mobileArtwork.evaluate((image) => getComputedStyle(image).objectFit)).toBe('contain');
  });

  test('advances the featured carousel automatically after five seconds', async ({ page }) => {
    await page.goto('/');
    const dots = page
      .getByRole('region', { name: 'Featured events' })
      .getByRole('group', { name: 'Choose carousel slide' })
      .getByRole('button');
    const initiallyActive = await dots.evaluateAll((buttons) =>
      buttons.findIndex((button) => button.getAttribute('aria-current') === 'true'),
    );

    await expect
      .poll(
        () =>
          dots.evaluateAll((buttons) =>
            buttons.findIndex((button) => button.getAttribute('aria-current') === 'true'),
          ),
        { timeout: 7_000 },
      )
      .not.toBe(initiallyActive);
  });

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

  test('uses the approved search, carousel controls, full-artwork fit, and Axon logo', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page.getByRole('search')).toHaveCount(1);
    await expect(page.locator('nav img[alt="Axon Tickets"]')).toHaveAttribute(
      'src',
      /axon-tickets-logo\.png/,
    );

    const carousel = page.getByRole('region', { name: 'Featured events' });
    await expect(carousel.getByText(/seats remaining|slots remaining/i)).toHaveCount(0);
    await expect(
      carousel.getByRole('button', {
        name: /previous featured|next featured|pause featured|resume featured/i,
      }),
    ).toHaveCount(0);

    const slideChooser = carousel.getByRole('group', { name: 'Choose carousel slide' });
    await expect(slideChooser).toBeVisible();
    const dots = slideChooser.getByRole('button');
    expect(await dots.count()).toBeGreaterThan(1);
    const dotVisuals = await dots.locator('span').evaluateAll((elements) =>
      elements.map((element) => {
        const rectangle = element.getBoundingClientRect();
        return { width: rectangle.width, height: rectangle.height };
      }),
    );
    expect(dotVisuals.every((dot) => dot.width <= 24 && dot.height <= 8)).toBe(true);

    await dots.nth(1).click();
    await expect(dots.nth(1)).toHaveAttribute('aria-current', 'true');

    const eventArtwork = page.locator('#events a[href^="/events/"] img[alt]:not([alt=""])').first();
    await expect(eventArtwork).toBeVisible();
    expect(await eventArtwork.evaluate((image) => getComputedStyle(image).objectFit)).toBe(
      'contain',
    );
  });

  test('search and category filtering preserve a stable empty/result state', async ({ page }) => {
    await page.goto('/?category=sports&q=nonexistent-release-two-event#events');

    await expect(
      page.getByRole('navigation', { name: 'Event categories' }).getByRole('link', {
        name: 'sports',
        exact: true,
      }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('search').getByRole('searchbox')).toHaveValue(
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
