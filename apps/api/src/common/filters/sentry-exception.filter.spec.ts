import { BadRequestException, ForbiddenException, HttpException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { SentryExceptionFilter } from './sentry-exception.filter';

jest.mock('@sentry/node', () => ({
  captureException: jest.fn(),
  flush: jest.fn().mockResolvedValue(true),
}));

function hostWithResponse() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('SentryExceptionFilter', () => {
  let filter: SentryExceptionFilter;

  beforeEach(() => {
    jest.clearAllMocks();
    (Sentry.flush as jest.Mock).mockResolvedValue(true);
    filter = new SentryExceptionFilter();
    // The filter logs unexpected errors; keep test output clean.
    jest.spyOn((filter as any).logger, 'error').mockImplementation(() => undefined);
  });

  it('reports an unexpected error, waits for it to be sent, and replies with a plain 500', async () => {
    const { host, status, json } = hostWithResponse();
    const error = new Error('boom with secret detail');

    await filter.catch(error, host);

    expect(Sentry.captureException).toHaveBeenCalledWith(error);
    expect(Sentry.flush).toHaveBeenCalledWith(2000);
    expect(status).toHaveBeenCalledWith(500);
    // The internal message is never sent to the caller.
    expect(json).toHaveBeenCalledWith({ statusCode: 500, message: 'Internal server error' });
  });

  it('reports a 5xx HttpException and keeps its own status and body', async () => {
    const { host, status, json } = hostWithResponse();
    const error = new HttpException({ statusCode: 503, message: 'Unavailable' }, 503);

    await filter.catch(error, host);

    expect(Sentry.captureException).toHaveBeenCalledWith(error);
    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({ statusCode: 503, message: 'Unavailable' });
  });

  it('does not report client errors and returns the same body as before', async () => {
    const { host, status, json } = hostWithResponse();
    const error = new BadRequestException('Bad input');

    await filter.catch(error, host);

    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.flush).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(error.getResponse());
  });

  it('keeps the standard shape for a bare-string HttpException, like Nest does by default', async () => {
    const { host, status, json } = hostWithResponse();

    await filter.catch(new HttpException('Plain message', 409), host);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({ statusCode: 409, message: 'Plain message' });
  });

  it('does not report a 403', async () => {
    const { host } = hostWithResponse();
    await filter.catch(new ForbiddenException('no'), host);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('still replies when Sentry cannot flush', async () => {
    (Sentry.flush as jest.Mock).mockRejectedValue(new Error('network down'));
    const { host, status, json } = hostWithResponse();

    await filter.catch(new Error('boom'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ statusCode: 500, message: 'Internal server error' });
  });
});
