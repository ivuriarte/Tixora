/**
 * confirmGuestCheckout: the code-attempt limit and the single-use rule must hold under
 * concurrency.
 *  - a failed try is counted atomically BEFORE the code is compared, so a burst of parallel
 *    guesses gets exactly MAX compares (not one per request)
 *  - the code is redeemed by a compare-and-delete on the exact stored record BEFORE any attendee
 *    write, so of two parallel requests with the right code exactly one succeeds and the other
 *    writes nothing, and a code replaced mid-request is never consumed by the older request
 *  - a Redis failure fails closed
 *
 * The Redis here is a stateful fake (see guest-hold.testing.ts), not canned mock returns: the
 * races these tests pin only exist when requests interleave over shared state.
 */
import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { RegistrationsService } from './registrations.service';
import { ConfirmGuestCheckoutDto } from './dto/checkout-confirmation.dto';
import { FakeRedis, makeGuestHold } from './guest-hold.testing';

const REG_ID = 'registration-1';
const TOKEN = 'valid-registration-scoped-token';
const EMAIL = 'guest@example.com';
const RIGHT_CODE = '123456';
const WRONG_CODE = '000000';
const OTP_KEY = `guest-checkout-otp:${REG_ID}`;
const ATTEMPTS_KEY = `guest-checkout-otp-attempts:${REG_ID}`;
const SENDS_KEY = `guest-checkout-otp-sends:${REG_ID}`;
const emailHash = (email: string) => createHash('sha256').update(email).digest('hex');
const COOLDOWN_KEY = `guest-checkout-otp-cooldown:${REG_ID}:${emailHash(EMAIL).slice(0, 16)}`;

const TOO_MANY = 'Too many failed attempts. Request a new code.';
const INCORRECT = 'Incorrect code. Please try again.';
const EXPIRED = 'Code expired or invalid. Request a new one.';
const ALREADY_USED = 'This code was already used. Request a new one.';

type RedisMethod =
  | 'get'
  | 'set'
  | 'del'
  | 'deleteIfEquals'
  | 'setIfNotExists'
  | 'incrementWithTtl'
  | 'decrementIfPositive'
  | 'ttl';

/** FakeRedis plus ttl() and the ability to make one operation fail. */
class OtpRedis extends FakeRedis {
  failOn = new Set<RedisMethod>();

  constructor() {
    super();
    const names: RedisMethod[] = [
      'get',
      'set',
      'del',
      'deleteIfEquals',
      'setIfNotExists',
      'incrementWithTtl',
      'decrementIfPositive',
      'ttl',
    ];
    for (const name of names) {
      const original = (this as unknown as Record<RedisMethod, (...args: unknown[]) => Promise<unknown>>)[name].bind(this);
      (this as unknown as Record<RedisMethod, (...args: unknown[]) => Promise<unknown>>)[name] = async (...args: unknown[]) => {
        if (this.failOn.has(name)) throw new Error('redis unavailable');
        return original(...args);
      };
    }
  }

  /** Same contract as RedisService.deleteIfEquals: delete only while the value is exactly `expected`. */
  async deleteIfEquals(key: string, expected: string): Promise<number> {
    if (this.store.get(key) !== expected) return 0;
    this.store.delete(key);
    return 1;
  }

  async ttl(key: string): Promise<number> {
    if (!this.store.has(key)) return -2;
    return this.ttls.get(key) ?? -1;
  }
}

let rightHash: string;
let compareSpy: jest.SpyInstance;

beforeAll(async () => {
  rightHash = await bcrypt.hash(RIGHT_CODE, 4);
});

beforeEach(() => {
  compareSpy = jest.spyOn(bcrypt, 'compare');
});

afterEach(() => {
  compareSpy.mockRestore();
});

function dtoFor(otp: string, opts: { email?: string; leadEmail?: string } = {}) {
  const email = opts.email ?? EMAIL;
  return {
    email,
    otp,
    attendees: [{ email: opts.leadEmail ?? email, firstName: 'Pat', lastName: 'Lee' }],
  } as unknown as ConfirmGuestCheckoutDto;
}

function build() {
  const redis = new OtpRedis();
  const prisma = {
    registration: {
      findFirst: jest.fn().mockResolvedValue({
        id: REG_ID,
        guestAccessTokenHash: createHash('sha256').update(TOKEN).digest('hex'),
      }),
      findUnique: jest.fn().mockResolvedValue({ eventId: 'event-1' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn(),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const email = { sendOtpEmail: jest.fn().mockResolvedValue(true) };
  const guestHold = makeGuestHold();
  const service = new RegistrationsService(
    prisma as never,
    email as never,
    audit as never,
    {} as never,
    {} as never,
    redis as never,
    undefined,
    guestHold.service,
    {} as never,
  );
  // The attendee save is its own, separately tested unit. Here it is the "write" the claim must
  // come before: it takes a moment, so parallel requests genuinely overlap.
  const writeAttendees = jest
    .spyOn(
      service as unknown as { updateAttendeesForRegistration: (...args: unknown[]) => Promise<unknown> },
      'updateAttendeesForRegistration',
    )
    .mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      return {
        message: 'Attendees updated',
        registrationId: REG_ID,
        referenceNumber: 'AX-TEST-0001',
        status: 'pending_approval',
      };
    });

  const storedRecord = JSON.stringify({ codeHash: rightHash, emailHash: emailHash(EMAIL) });
  redis.store.set(OTP_KEY, storedRecord);
  redis.ttls.set(OTP_KEY, 240);
  redis.store.set(SENDS_KEY, '2');
  redis.store.set(COOLDOWN_KEY, '1');

  const confirm = (dto: ConfirmGuestCheckoutDto) => service.confirmGuestCheckout(REG_ID, TOKEN, dto);
  return { service, redis, prisma, audit, writeAttendees, confirm, storedRecord };
}

const messageOf = (result: PromiseSettledResult<unknown>) => {
  if (result.status !== 'rejected') return null;
  const response = (result.reason as BadRequestException).getResponse?.();
  return typeof response === 'string' ? response : (response as { message?: string })?.message ?? String(result.reason);
};

describe('confirmGuestCheckout: attempt limit under concurrency', () => {
  it('gives ten parallel wrong guesses exactly five real compares', async () => {
    const { redis, confirm, writeAttendees } = build();

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => confirm(dtoFor(WRONG_CODE))),
    );

    expect(compareSpy).toHaveBeenCalledTimes(5);
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    const messages = results.map(messageOf);
    expect(messages.filter((m) => m === INCORRECT)).toHaveLength(4);
    expect(messages.filter((m) => m === TOO_MANY)).toHaveLength(6);
    // The fifth wrong try invalidates the code; nothing was written.
    expect(redis.store.has(OTP_KEY)).toBe(false);
    expect(writeAttendees).not.toHaveBeenCalled();
  });

  it('keeps the same messages and the 5th wrong try still burns the code', async () => {
    const { redis, confirm } = build();

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await expect(confirm(dtoFor(WRONG_CODE))).rejects.toThrow(INCORRECT);
      expect(redis.store.has(OTP_KEY)).toBe(true);
    }
    await expect(confirm(dtoFor(WRONG_CODE))).rejects.toThrow(TOO_MANY);
    expect(redis.store.has(OTP_KEY)).toBe(false);
    // The code is gone, so even the right code now gets the expired answer.
    await expect(confirm(dtoFor(RIGHT_CODE))).rejects.toThrow(EXPIRED);
  });

  it('still succeeds on the 5th try when that try has the right code', async () => {
    const { redis, confirm, writeAttendees } = build();
    redis.store.set(ATTEMPTS_KEY, '4'); // four wrong tries already used

    await expect(confirm(dtoFor(RIGHT_CODE))).resolves.toMatchObject({ registrationId: REG_ID });
    expect(writeAttendees).toHaveBeenCalledTimes(1);
  });

  it('stops early, without counting or comparing, when the stored counter is already at the limit', async () => {
    const { redis, confirm, writeAttendees } = build();
    redis.store.set(ATTEMPTS_KEY, '5');
    const increment = jest.spyOn(redis, 'incrementWithTtl');

    await expect(confirm(dtoFor(RIGHT_CODE))).rejects.toThrow(TOO_MANY);
    expect(increment).not.toHaveBeenCalled();
    expect(compareSpy).not.toHaveBeenCalled();
    expect(writeAttendees).not.toHaveBeenCalled();
  });

  it('counts a right code for the wrong address as a failed try, without comparing the code', async () => {
    const { redis, confirm } = build();

    await expect(confirm(dtoFor(RIGHT_CODE, { email: 'someone.else@example.com' }))).rejects.toThrow(INCORRECT);
    expect(compareSpy).not.toHaveBeenCalled();
    expect(redis.store.get(ATTEMPTS_KEY)).toBe('1');
  });

  it('does not use up tries on a right code followed by a mistake in the attendee form', async () => {
    const { redis, confirm, writeAttendees } = build();

    // Six submits with the right code but a lead email that does not match: all rejected for that
    // reason (never "too many"), the code stays, and no try is lost.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await expect(
        confirm(dtoFor(RIGHT_CODE, { leadEmail: 'not.the.lead@example.com' })),
      ).rejects.toThrow('The confirmation email must match Attendee 1.');
    }
    expect(redis.store.has(OTP_KEY)).toBe(true);
    expect(Number(redis.store.get(ATTEMPTS_KEY) ?? '0')).toBe(0);
    expect(writeAttendees).not.toHaveBeenCalled();

    await expect(confirm(dtoFor(RIGHT_CODE))).resolves.toMatchObject({ registrationId: REG_ID });
  });
});

describe('confirmGuestCheckout: single use under concurrency', () => {
  it('lets exactly one of two parallel right-code requests through, and the loser writes nothing', async () => {
    const { redis, confirm, writeAttendees, audit } = build();

    const results = await Promise.allSettled([confirm(dtoFor(RIGHT_CODE)), confirm(dtoFor(RIGHT_CODE))]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(BadRequestException);
    expect(messageOf(rejected[0])).toBe(ALREADY_USED);
    // One save, one audit entry: the refused request issued nothing.
    expect(writeAttendees).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(redis.store.has(OTP_KEY)).toBe(false);
  });

  it('lets exactly one of five parallel right-code requests through', async () => {
    const { confirm, writeAttendees, audit } = build();

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => confirm(dtoFor(RIGHT_CODE))),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.map(messageOf).filter((m) => m === ALREADY_USED)).toHaveLength(4);
    expect(writeAttendees).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledTimes(1);
  });

  it('refuses a repeat of the same code after it was used', async () => {
    const { confirm, writeAttendees } = build();

    await confirm(dtoFor(RIGHT_CODE));
    await expect(confirm(dtoFor(RIGHT_CODE))).rejects.toThrow(EXPIRED);
    expect(writeAttendees).toHaveBeenCalledTimes(1);
  });

  it('clears the code, counter, cooldown and hourly send count after a success', async () => {
    const { redis, confirm } = build();

    await confirm(dtoFor(RIGHT_CODE));

    expect(redis.store.has(OTP_KEY)).toBe(false);
    expect(redis.store.has(ATTEMPTS_KEY)).toBe(false);
    expect(redis.store.has(COOLDOWN_KEY)).toBe(false);
    expect(redis.store.has(SENDS_KEY)).toBe(false);
  });

  it('gives the code back after a failed save, with its remaining life, so the same code can be retried', async () => {
    const { redis, confirm, writeAttendees, storedRecord } = build();
    writeAttendees.mockRejectedValueOnce(new BadRequestException('Expected 2 attendee(s) — cannot change quantity'));

    await expect(confirm(dtoFor(RIGHT_CODE))).rejects.toThrow('Expected 2 attendee(s)');
    expect(redis.store.get(OTP_KEY)).toBe(storedRecord);
    expect(redis.ttls.get(OTP_KEY)).toBe(240);

    await expect(confirm(dtoFor(RIGHT_CODE))).resolves.toMatchObject({ registrationId: REG_ID });
    expect(writeAttendees).toHaveBeenCalledTimes(2);
  });

  it('never overwrites a newer code with the one it gives back', async () => {
    const { redis, confirm, writeAttendees } = build();
    const newer = JSON.stringify({ codeHash: 'newer-hash', emailHash: emailHash(EMAIL) });
    writeAttendees.mockImplementationOnce(async () => {
      redis.store.set(OTP_KEY, newer); // the buyer asked for a new code while the save ran
      throw new BadRequestException('Attendee details can only be completed before final approval review');
    });

    await expect(confirm(dtoFor(RIGHT_CODE))).rejects.toThrow('Attendee details can only be completed');
    expect(redis.store.get(OTP_KEY)).toBe(newer);
  });

  it('refuses a request whose code was replaced while it ran, and leaves the newer code alone', async () => {
    const { redis, prisma, confirm, writeAttendees } = build();
    const newer = JSON.stringify({ codeHash: 'newer-hash', emailHash: emailHash(EMAIL) });
    // The buyer asks for a new code while this request is between its first read and its claim.
    prisma.registration.findMany.mockImplementationOnce(async () => {
      redis.store.set(OTP_KEY, newer);
      return [];
    });

    await expect(confirm(dtoFor(RIGHT_CODE))).rejects.toThrow(ALREADY_USED);

    expect(writeAttendees).not.toHaveBeenCalled();
    expect(redis.store.get(OTP_KEY)).toBe(newer);
  });

  it('gives the code back for a full life when Redis cannot report the remaining time', async () => {
    const { redis, confirm, writeAttendees, storedRecord } = build();
    redis.ttls.delete(OTP_KEY); // ttl() now answers -1
    writeAttendees.mockRejectedValueOnce(new BadRequestException('Expected 2 attendee(s) — cannot change quantity'));

    await expect(confirm(dtoFor(RIGHT_CODE))).rejects.toThrow('Expected 2 attendee(s)');

    expect(redis.store.get(OTP_KEY)).toBe(storedRecord);
    expect(redis.ttls.get(OTP_KEY)).toBe(300); // the normal life of a code (5 minutes)
  });

  it('shows the buyer the original error, and logs no code, when the code cannot be given back', async () => {
    const { service, redis, confirm, writeAttendees } = build();
    const warn = jest
      .spyOn((service as unknown as { logger: { warn: (...args: unknown[]) => void } }).logger, 'warn')
      .mockImplementation(() => undefined);
    writeAttendees.mockRejectedValueOnce(
      new BadRequestException('Birthday must be a valid past date within the last 120 years.'),
    );
    redis.failOn.add('setIfNotExists');

    await expect(confirm(dtoFor(RIGHT_CODE))).rejects.toThrow('Birthday must be a valid past date');

    expect(redis.store.has(OTP_KEY)).toBe(false); // the buyer will have to ask for a new code
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain(REG_ID);
    expect(logged).not.toContain(RIGHT_CODE);
    expect(logged).not.toContain(rightHash);
    expect(logged).not.toContain(EMAIL);
  });

  it('cannot save an order whose attendee details are already complete, even with the code given back', async () => {
    const { redis, prisma, audit, writeAttendees, confirm } = build();
    writeAttendees.mockRestore(); // use the real attendee save: its status check is the guard here
    const completedOrder = {
      id: REG_ID,
      userId: null,
      referenceNumber: 'AX-TEST-0001',
      status: 'pending_approval',
      total: 500,
      attendeeCount: 1,
      attendeesCompletedAt: new Date(),
      attendees: [],
      event: { id: 'event-1', title: 'Test event', slug: 'test-event', eventType: 'general', runningConfig: null, startsAt: new Date() },
    };
    prisma.registration.findFirst.mockImplementation(
      async (args: { where: { guestAccessTokenHash?: unknown } }) =>
        args.where.guestAccessTokenHash
          ? { id: REG_ID, guestAccessTokenHash: createHash('sha256').update(TOKEN).digest('hex') }
          : completedOrder,
    );

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(confirm(dtoFor(RIGHT_CODE))).rejects.toThrow(
        'Attendee details can only be completed before final approval review',
      );
      expect(redis.store.has(OTP_KEY)).toBe(true); // given back each time, and refused each time
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('does not give the code back to a request that lost the claim', async () => {
    const { redis, confirm, writeAttendees } = build();

    // B loses the claim while A's save is still running; A's save then succeeds.
    const [a, b] = await Promise.allSettled([confirm(dtoFor(RIGHT_CODE)), confirm(dtoFor(RIGHT_CODE))]);

    expect([a.status, b.status].sort()).toEqual(['fulfilled', 'rejected']);
    expect(writeAttendees).toHaveBeenCalledTimes(1);
    expect(redis.store.has(OTP_KEY)).toBe(false);
  });
});

describe('confirmGuestCheckout: Redis failure fails closed', () => {
  it.each<RedisMethod>(['get', 'incrementWithTtl', 'decrementIfPositive', 'ttl', 'deleteIfEquals'])(
    'issues nothing and confirms nothing when Redis %s fails',
    async (method) => {
      const { redis, confirm, writeAttendees, audit } = build();
      redis.failOn.add(method);

      await expect(confirm(dtoFor(RIGHT_CODE))).rejects.toThrow('redis unavailable');

      expect(writeAttendees).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    },
  );

  it('does not compare a code when the attempt cannot be counted', async () => {
    const { redis, confirm } = build();
    redis.failOn.add('incrementWithTtl');

    await expect(confirm(dtoFor(WRONG_CODE))).rejects.toThrow('redis unavailable');
    expect(compareSpy).not.toHaveBeenCalled();
  });

  it('fails closed when Redis is down for every call', async () => {
    const { redis, confirm, writeAttendees } = build();
    redis.outage = true;

    await expect(confirm(dtoFor(RIGHT_CODE))).rejects.toThrow('redis unavailable');
    expect(writeAttendees).not.toHaveBeenCalled();
  });
});
