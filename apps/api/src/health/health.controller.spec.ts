import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

function make(db: boolean, redis: boolean) {
  const health = { checkDatabase: jest.fn().mockResolvedValue(db), checkRedis: jest.fn().mockResolvedValue(redis) };
  const config = { get: jest.fn().mockReturnValue('test') };
  return new HealthController(health as never, config as never);
}

describe('HealthController', () => {
  it('returns ok when database and redis are up', async () => {
    const result = await make(true, true).check();
    expect(result.status).toBe('ok');
    expect(result.checks).toEqual({ database: 'ok', redis: 'ok' });
  });

  it.each([
    [false, true, { database: 'error', redis: 'ok' }],
    [true, false, { database: 'ok', redis: 'error' }],
    [false, false, { database: 'error', redis: 'error' }],
  ])('returns HTTP 503 when a dependency is down (db=%s redis=%s)', async (db, redis, checks) => {
    const attempt = make(db, redis).check();
    await expect(attempt).rejects.toBeInstanceOf(ServiceUnavailableException);
    const error = (await attempt.catch((e: ServiceUnavailableException) => e)) as ServiceUnavailableException;
    expect(error.getStatus()).toBe(503);
    expect(error.getResponse()).toMatchObject({ status: 'degraded', checks });
  });
});
