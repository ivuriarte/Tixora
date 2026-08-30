import { expect, test } from './support/qa-test';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:3001';

test.describe('Cybersecurity regression', () => {
  test('web responses enforce the release security-header baseline', async ({ request }) => {
    const response = await request.get('/');
    expect(response.status()).toBe(200);

    const headers = response.headers();
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['strict-transport-security']).toContain('max-age=63072000');
    expect(headers['permissions-policy']).toContain('microphone=()');

    const csp = headers['content-security-policy'];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  test('API applies Helmet and does not reflect an untrusted CORS origin', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/v1/health`, {
      headers: { Origin: 'https://attacker.invalid' },
    });
    expect(response.status()).toBe(200);
    const headers = response.headers();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(headers['access-control-allow-origin']).not.toBe('https://attacker.invalid');
  });

  test('sensitive admin resources reject anonymous access consistently', async ({ request }) => {
    const resources = [
      '/api/v1/admin/events',
      '/api/v1/admin/users',
      '/api/v1/admin/organizers',
      '/api/v1/admin/settings/platform',
      '/api/v1/admin/analytics/dashboard',
      '/api/v1/admin/analytics/executive',
      '/api/v1/admin/analytics/executive/export',
    ];

    for (const resource of resources) {
      const response = await request.get(`${API_URL}${resource}`);
      expect([401, 403], `${resource} must be protected`).toContain(response.status());
    }
  });

  test('API validation strips the legacy public attendee-id check-in path', async ({ request }) => {
    const response = await request.post(
      `${API_URL}/api/v1/events/non-existent-event/onsite-registration`,
      {
        data: { attendeeId: 'attendee-private-id' },
      },
    );
    expect([400, 404]).toContain(response.status());
    const text = await response.text();
    expect(text).not.toMatch(/at\s+[A-Za-z0-9_$]+\s+\(|\/Users\/|node_modules/);
  });

  test('unexpected API failures do not disclose stack traces or filesystem paths', async ({
    request,
  }) => {
    const response = await request.get(`${API_URL}/api/v1/events/does-not-exist-security-check`);
    expect(response.status()).toBe(404);
    const text = await response.text();
    expect(text).not.toMatch(/at\s+[A-Za-z0-9_$]+\s+\(|\/Users\/|\/var\/task\/|node_modules/);
  });
});
