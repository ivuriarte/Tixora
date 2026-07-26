import { expect, test, type Page } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'https://api-uat.axontickets.online';

async function expectNoStructuralAccessibilityIssues(page: Page) {
  const issues = await page.evaluate(() => {
    const findings: string[] = [];
    const duplicateIds = [...document.querySelectorAll<HTMLElement>('[id]')]
      .map((element) => element.id)
      .filter((id, index, ids) => id && ids.indexOf(id) !== index);
    if (duplicateIds.length) {
      findings.push(`duplicate ids: ${[...new Set(duplicateIds)].join(', ')}`);
    }

    document.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
      if (!image.hasAttribute('alt')) findings.push(`image missing alt: ${image.src}`);
    });
    document.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      const name =
        button.getAttribute('aria-label') ||
        button.getAttribute('title') ||
        button.textContent?.trim();
      if (!name) findings.push('button missing accessible name');
    });
    document
      .querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        'input:not([type="hidden"]), select, textarea',
      )
      .forEach((control) => {
        const labelled =
          control.getAttribute('aria-label') ||
          control.getAttribute('aria-labelledby') ||
          (control.id && document.querySelector(`label[for="${CSS.escape(control.id)}"]`)) ||
          control.closest('label');
        if (!labelled) {
          findings.push(`${control.tagName.toLowerCase()} missing programmatic label`);
        }
      });

    return findings;
  });

  expect(issues).toEqual([]);
}

test.describe('Release 2.0 accessibility and responsive layout', () => {
  test('homepage has named controls, labelled fields, unique ids, and no horizontal overflow', async ({
    page,
  }) => {
    await page.goto('/');
    await expectNoStructuralAccessibilityIssues(page);
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  });

  test('mobile discovery and guest choice remain usable without overflow', async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
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
    const summary = list.data[0];
    const eventResponse = await request.get(`${API_URL}/api/v1/events/${summary.slug}`);
    const eventJson = await eventResponse.json();
    const event = eventJson.data ?? eventJson;

    await page.goto(`/events/${event.slug}/register?tierId=${event.tiers[0].id}&qty=1`);
    await expect(page.getByRole('heading', { name: 'Choose how to continue' })).toBeVisible();
    await expectNoStructuralAccessibilityIssues(page);
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  });
});
