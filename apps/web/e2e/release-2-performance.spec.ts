import { expect, test } from '@playwright/test';

type NavigationSample = {
  ttfbMs: number;
  domContentLoadedMs: number;
  loadMs: number;
  firstContentfulPaintMs: number;
};

function percentile(values: number[], percentileRank: number) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil((percentileRank / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

test.describe('Release 2.0 performance budgets', () => {
  test('homepage navigation stays within the UAT release budgets', async ({ page }) => {
    const samples: NavigationSample[] = [];

    for (let run = 0; run < 5; run += 1) {
      await page.goto('/', { waitUntil: 'load' });
      const sample = await page.evaluate(() => {
        const navigation = performance.getEntriesByType(
          'navigation',
        )[0] as PerformanceNavigationTiming;
        const firstContentfulPaint =
          performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0;

        return {
          ttfbMs: navigation.responseStart,
          domContentLoadedMs: navigation.domContentLoadedEventEnd,
          loadMs: navigation.loadEventEnd,
          firstContentfulPaintMs: firstContentfulPaint,
        };
      });
      samples.push(sample);
    }

    const summary = {
      sampleCount: samples.length,
      p50: {
        ttfbMs: percentile(
          samples.map((sample) => sample.ttfbMs),
          50,
        ),
        domContentLoadedMs: percentile(
          samples.map((sample) => sample.domContentLoadedMs),
          50,
        ),
        loadMs: percentile(
          samples.map((sample) => sample.loadMs),
          50,
        ),
        firstContentfulPaintMs: percentile(
          samples.map((sample) => sample.firstContentfulPaintMs),
          50,
        ),
      },
      p95: {
        ttfbMs: percentile(
          samples.map((sample) => sample.ttfbMs),
          95,
        ),
        domContentLoadedMs: percentile(
          samples.map((sample) => sample.domContentLoadedMs),
          95,
        ),
        loadMs: percentile(
          samples.map((sample) => sample.loadMs),
          95,
        ),
        firstContentfulPaintMs: percentile(
          samples.map((sample) => sample.firstContentfulPaintMs),
          95,
        ),
      },
    };

    console.info(`RELEASE_2_PERFORMANCE ${JSON.stringify(summary)}`);

    expect(summary.p95.ttfbMs).toBeLessThan(1_500);
    expect(summary.p95.domContentLoadedMs).toBeLessThan(3_000);
    expect(summary.p95.loadMs).toBeLessThan(5_000);
    expect(summary.p95.firstContentfulPaintMs).toBeLessThan(3_000);
  });
});
