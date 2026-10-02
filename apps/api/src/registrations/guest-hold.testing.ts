import { GuestHoldService } from './guest-hold.service';

/** Test-only: an in-memory stand-in for RedisService with a switchable outage. */
export class FakeRedis {
  readonly store = new Map<string, string>();
  readonly ttls = new Map<string, number>();
  outage = false;

  private guard(): void {
    if (this.outage) throw new Error('redis unavailable');
  }

  async get(key: string): Promise<string | null> {
    this.guard();
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.guard();
    this.store.set(key, value);
    if (ttlSeconds) this.ttls.set(key, ttlSeconds);
  }

  async del(key: string): Promise<number> {
    this.guard();
    return this.store.delete(key) ? 1 : 0;
  }

  async setIfNotExists(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    this.guard();
    if (this.store.has(key)) return false;
    this.store.set(key, value);
    this.ttls.set(key, ttlSeconds);
    return true;
  }

  async incrementWithTtl(key: string, ttlSeconds: number): Promise<{ count: number; ttlSeconds: number }> {
    this.guard();
    const count = Number(this.store.get(key) ?? '0') + 1;
    this.store.set(key, String(count));
    if (count === 1) this.ttls.set(key, ttlSeconds);
    return { count, ttlSeconds };
  }

  async decrementIfPositive(key: string): Promise<number> {
    this.guard();
    const current = Number(this.store.get(key) ?? '0');
    if (current > 0) {
      this.store.set(key, String(current - 1));
      return current - 1;
    }
    return 0;
  }
}

export const TEST_PRIVATE_KEY = 'test-private-key-material-that-is-long-enough-0123456789';

export function makeGuestHoldConfig(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    'guestHold.minutes': 60,
    'guestHold.extendedHours': 24,
    'guestHold.perIp': 5,
    'guestHold.extendedPerIp': 2,
    'jwt.privateKey': TEST_PRIVATE_KEY,
    webUrl: 'https://axontickets.online',
    ...overrides,
  };
  return { get: jest.fn((key: string) => values[key]) };
}

export function makeGuestHold(overrides: Record<string, unknown> = {}) {
  const redis = new FakeRedis();
  const config = makeGuestHoldConfig(overrides);
  const service = new GuestHoldService(config as never, redis as never);
  return { service, redis, config };
}
