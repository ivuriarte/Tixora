import * as Sentry from '@sentry/node';
import { initSentry } from './sentry-init';

jest.mock('@sentry/node', () => ({ init: jest.fn() }));

describe('initSentry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  it('does nothing and reports inactive when SENTRY_DSN is not set', () => {
    expect(initSentry({} as NodeJS.ProcessEnv)).toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('starts Sentry once per process with the app environment and the privacy scrubber', async () => {
    // Fresh module so the "already started" flag is clean for this test.
    const { initSentry: freshInit } = await import('./sentry-init');
    const env = { SENTRY_DSN: 'https://key@example.ingest.sentry.io/1', APP_ENV: 'production' } as NodeJS.ProcessEnv;

    expect(freshInit(env)).toBe(true);
    expect(freshInit(env)).toBe(true);

    const { init } = jest.requireMock('@sentry/node') as { init: jest.Mock };
    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: env.SENTRY_DSN,
        environment: 'production',
        tracesSampleRate: 0.1,
        beforeSend: expect.any(Function),
        beforeSendTransaction: expect.any(Function),
      }),
    );

    // The hooks passed to Sentry must be the privacy scrubber: secrets and bodies are removed.
    const options = init.mock.calls[0][0] as { beforeSend: (e: any) => any };
    const scrubbed = options.beforeSend({
      request: { headers: { authorization: 'Bearer secret', accept: 'json' }, data: { email: 'a@b.c' } },
    });
    expect(scrubbed.request.headers).toEqual({ accept: 'json' });
    expect(scrubbed.request.data).toBeUndefined();
  });

  it('samples every trace outside production and labels a missing APP_ENV as development', async () => {
    const { initSentry: freshInit } = await import('./sentry-init');
    freshInit({ SENTRY_DSN: 'https://key@example.ingest.sentry.io/1' } as NodeJS.ProcessEnv);

    const { init } = jest.requireMock('@sentry/node') as { init: jest.Mock };
    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({ environment: 'development', tracesSampleRate: 1.0 }),
    );
  });
});
