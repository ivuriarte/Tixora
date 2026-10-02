import { BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { SentryExceptionFilter } from './sentry-exception.filter';

function run(exception: unknown) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = { switchToHttp: () => ({ getResponse: () => ({ status }) }) };
  const done = new SentryExceptionFilter().catch(exception, host as never);
  return { done, status, json };
}

describe('SentryExceptionFilter', () => {
  let capture: jest.SpyInstance;
  beforeEach(() => {
    capture = jest.spyOn(Sentry, 'captureException').mockReturnValue('id');
    jest.spyOn(Sentry, 'flush').mockResolvedValue(true);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('passes 4xx HttpExceptions through unchanged and does not report them', async () => {
    const { done, status, json } = run(new BadRequestException('nope'));
    await done;
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ message: 'nope' }));
    expect(capture).not.toHaveBeenCalled();
  });

  it('reports 5xx HttpExceptions', async () => {
    const { done, status } = run(new InternalServerErrorException('boom'));
    await done;
    expect(status).toHaveBeenCalledWith(500);
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('keeps client status for middleware errors (malformed JSON stays 400, not 500)', async () => {
    const { done, status, json } = run(Object.assign(new Error('Unexpected token } in JSON'), { status: 400, statusCode: 400 }));
    await done;
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ statusCode: 400, message: 'Unexpected token } in JSON' });
    expect(capture).not.toHaveBeenCalled();
  });

  it('keeps 413 payload-too-large', async () => {
    const { done, status } = run(Object.assign(new Error('request entity too large'), { statusCode: 413 }));
    await done;
    expect(status).toHaveBeenCalledWith(413);
  });

  it('turns unexpected errors into a generic 500 with no internals, and reports them', async () => {
    const { done, status, json } = run(new TypeError('secret internal detail'));
    await done;
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ statusCode: 500, message: 'Internal server error' });
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('still responds if Sentry itself throws', async () => {
    capture.mockImplementation(() => {
      throw new Error('sentry down');
    });
    const { done, status } = run(new TypeError('x'));
    await done;
    expect(status).toHaveBeenCalledWith(500);
  });
});
