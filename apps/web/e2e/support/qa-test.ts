import {
  expect,
  test as base,
  type ConsoleMessage,
  type Page,
  type Request,
  type Response,
} from '@playwright/test';

export interface BrowserDiagnostics {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: Array<{ method: string; url: string; reason: string }>;
  abortedRequests: Array<{ method: string; url: string; reason: string }>;
  serverErrors: Array<{ method: string; url: string; status: number }>;
}

function safeUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return `${url.origin}${url.pathname}`;
  } catch {
    return rawUrl.split('?')[0];
  }
}

export const test = base.extend<{ diagnostics: BrowserDiagnostics }>({
  diagnostics: [
    async ({ page }, use, testInfo) => {
      // Vercel injects its preview feedback toolbar into protected deployments.
      // The toolbar probes the site root with OPTIONS and currently receives a
      // 400 from Vercel itself, which creates a Chromium console error even
      // though the Axon flow succeeds. Stub only the external toolbar bootstrap
      // so release tests continue to fail on every Axon request and console
      // error without treating Vercel's QA overlay as product behavior.
      await page.route('https://vercel.live/_next-live/feedback/feedback.js**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/javascript; charset=utf-8',
          body: '/* Vercel toolbar disabled during automated product testing. */',
        });
      });

      const diagnostics: BrowserDiagnostics = {
        consoleErrors: [],
        pageErrors: [],
        failedRequests: [],
        abortedRequests: [],
        serverErrors: [],
      };

      const onConsole = (message: ConsoleMessage) => {
        if (message.type() !== 'error') return;

        const location = message.location();
        const source = location.url
          ? ` (${safeUrl(location.url)}:${location.lineNumber}:${location.columnNumber})`
          : '';
        diagnostics.consoleErrors.push(`${message.text()}${source}`);
      };
      const onPageError = (error: Error) => diagnostics.pageErrors.push(error.message);
      const onRequestFailed = (request: Request) => {
        const failure = {
          method: request.method(),
          url: safeUrl(request.url()),
          reason: request.failure()?.errorText ?? 'Unknown request failure',
        };
        // Next.js deliberately aborts stale document, RSC, and prefetch requests
        // during client-side redirects. Preserve them as evidence without
        // treating an intentional cancellation as an infrastructure failure.
        if (
          failure.reason.includes('ERR_ABORTED') ||
          failure.reason.includes('NS_BINDING_ABORTED')
        ) {
          diagnostics.abortedRequests.push(failure);
          return;
        }
        diagnostics.failedRequests.push(failure);
      };
      const onResponse = (response: Response) => {
        if (response.status() >= 500) {
          diagnostics.serverErrors.push({
            method: response.request().method(),
            url: safeUrl(response.url()),
            status: response.status(),
          });
        }
      };

      page.on('console', onConsole);
      page.on('pageerror', onPageError);
      page.on('requestfailed', onRequestFailed);
      page.on('response', onResponse);

      await use(diagnostics);

      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('requestfailed', onRequestFailed);
      page.off('response', onResponse);

      await testInfo.attach('browser-diagnostics', {
        body: Buffer.from(JSON.stringify(diagnostics, null, 2)),
        contentType: 'application/json',
      });
    },
    { auto: true },
  ],
});

export function expectNoBrowserFailures(diagnostics: BrowserDiagnostics) {
  expect(diagnostics.pageErrors, 'Unhandled page errors').toEqual([]);
  expect(diagnostics.failedRequests, 'Failed network requests').toEqual([]);
  expect(diagnostics.serverErrors, 'HTTP 5xx responses').toEqual([]);
  expect(diagnostics.consoleErrors, 'Browser console errors').toEqual([]);
}

export { expect, type Page };
