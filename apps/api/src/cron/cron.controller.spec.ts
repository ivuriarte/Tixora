import { UnauthorizedException } from '@nestjs/common';
import { CronController, safeEqual } from './cron.controller';

describe('cron secret check', () => {
  const OLD = process.env.CRON_SECRET;
  const make = () => new CronController({ releaseExpiredReservations: jest.fn() } as never, {} as never);
  const verify = (c: CronController, secret?: string, auth?: string) =>
    (c as unknown as { verifySecret(s?: string, a?: string): void }).verifySecret(secret, auth);

  afterEach(() => {
    if (OLD === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = OLD;
  });

  it('accepts the right secret via header or Bearer token', () => {
    process.env.CRON_SECRET = 's3cret-value';
    expect(() => verify(make(), 's3cret-value')).not.toThrow();
    expect(() => verify(make(), undefined, 'Bearer s3cret-value')).not.toThrow();
  });

  it('rejects wrong, missing and different-length secrets', () => {
    process.env.CRON_SECRET = 's3cret-value';
    expect(() => verify(make(), 'wrong')).toThrow(UnauthorizedException);
    expect(() => verify(make(), 's3cret-valuE')).toThrow(UnauthorizedException);
    expect(() => verify(make(), undefined, 'Bearer nope')).toThrow(UnauthorizedException);
    expect(() => verify(make())).toThrow(UnauthorizedException);
  });

  it('fails closed when CRON_SECRET is not configured', () => {
    delete process.env.CRON_SECRET;
    expect(() => verify(make(), '')).toThrow(UnauthorizedException);
    expect(() => verify(make(), 'anything')).toThrow(UnauthorizedException);
  });

  it('safeEqual compares correctly', () => {
    expect(safeEqual('a', 'a')).toBe(true);
    expect(safeEqual('a', 'b')).toBe(false);
    expect(safeEqual(undefined, 'a')).toBe(false);
    expect(safeEqual('', '')).toBe(false);
  });
});
