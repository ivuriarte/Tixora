import { Controller, ForbiddenException, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as Sentry from '@sentry/node';
import type { Envelope } from '@sentry/core';
import { SentryExceptionFilter } from './sentry-exception.filter';

/**
 * End-to-end wiring check with the real Sentry SDK and a fake transport (nothing is sent
 * over the network): an unexpected error becomes a Sentry event and a plain 500, while a
 * client error (403) is not reported.
 */
@Controller('probe')
class ProbeController {
  @Get('boom')
  boom() {
    throw new Error('Sentry API verification test (safe to resolve)');
  }

  @Get('forbidden')
  forbidden() {
    throw new ForbiddenException('Platform admin access required');
  }
}

describe('Sentry wiring through the global exception filter', () => {
  const envelopes: Envelope[] = [];
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    Sentry.init({
      dsn: 'https://publickey@o0.ingest.sentry.io/0',
      environment: 'test',
      // Fake transport: record the envelope and report success.
      transport: () => ({
        send: async (envelope: Envelope) => {
          envelopes.push(envelope);
          return {};
        },
        flush: async () => true,
      }),
    });

    const moduleRef = await Test.createTestingModule({ controllers: [ProbeController] }).compile();
    app = moduleRef.createNestApplication();
    const filter = new SentryExceptionFilter();
    // The filter logs the deliberate error; keep test output clean.
    jest.spyOn((filter as any).logger, 'error').mockImplementation(() => undefined);
    app.useGlobalFilters(filter);
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    envelopes.length = 0;
  });

  const errorEvents = () =>
    envelopes.flatMap((envelope) =>
      (envelope[1] as Array<[{ type: string }, any]>).filter(([header]) => header.type === 'event').map(([, event]) => event),
    );

  it('reports an unexpected error to Sentry before replying with a plain 500', async () => {
    const res = await fetch(`${baseUrl}/probe/boom`);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ statusCode: 500, message: 'Internal server error' });
    const events = errorEvents();
    expect(events).toHaveLength(1);
    expect(events[0].exception.values[0].value).toBe('Sentry API verification test (safe to resolve)');
  });

  it('does not report a client error', async () => {
    const res = await fetch(`${baseUrl}/probe/forbidden`);

    expect(res.status).toBe(403);
    expect(errorEvents()).toHaveLength(0);
  });
});
