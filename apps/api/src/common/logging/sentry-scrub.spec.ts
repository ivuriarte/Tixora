import { scrubSentryEvent } from './sentry-scrub';

describe('scrubSentryEvent', () => {
  it('removes bearer-style headers (any casing) and keeps the rest', () => {
    const event = scrubSentryEvent({
      type: undefined,
      request: {
        headers: {
          'X-Registration-Token': 'SECRET',
          authorization: 'Bearer SECRET',
          'user-agent': 'jest',
        },
      },
    } as never) as { request: { headers: Record<string, string> } };
    expect(event.request.headers).toEqual({ 'user-agent': 'jest' });
  });

  it('leaves events without a request untouched', () => {
    const event = { message: 'boom' } as never;
    expect(scrubSentryEvent(event)).toBe(event);
  });
});
