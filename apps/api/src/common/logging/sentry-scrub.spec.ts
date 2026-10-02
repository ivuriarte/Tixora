import { scrubSentryEvent } from './sentry-scrub';

describe('scrubSentryEvent', () => {
  it('removes bearer-style headers (any casing) and keeps the rest', () => {
    const event = scrubSentryEvent({
      request: {
        headers: {
          'X-Registration-Token': 'SECRET',
          authorization: 'Bearer SECRET',
          'user-agent': 'jest',
        },
      },
    });
    expect(event.request?.headers).toEqual({ 'user-agent': 'jest' });
  });

  it('drops the request body, cookies and query string, which can hold a resume token or a typed email', () => {
    const event = scrubSentryEvent({
      request: {
        headers: { 'user-agent': 'jest' },
        data: { token: 'v1.signed-resume-token', email: 'guest@example.com' },
        cookies: { session: 'SECRET' },
        query_string: 'token=SECRET',
      },
    });
    expect(event.request).toEqual({ headers: { 'user-agent': 'jest' } });
    expect(JSON.stringify(event)).not.toContain('guest@example.com');
    expect(JSON.stringify(event)).not.toContain('signed-resume-token');
  });

  it('leaves events without a request untouched', () => {
    const event: { message: string; request?: undefined } = { message: 'boom' };
    expect(scrubSentryEvent(event)).toBe(event);
  });
});
