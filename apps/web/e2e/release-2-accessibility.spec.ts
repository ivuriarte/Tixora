import { expect, test, type Page } from './support/qa-test';

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

  test('mobile discovery and merged customer access remain usable without overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/auth/login');
    await expect(page.getByRole('heading', { name: 'Enter Email' })).toBeVisible();
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expectNoStructuralAccessibilityIssues(page);
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  });
});
