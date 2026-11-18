import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { RegistrationsService } from './registrations.service';
import { makeGuestHold } from './guest-hold.testing';

function makeService() {
  const prisma = {
    registration: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const email = { sendOtpEmail: jest.fn().mockResolvedValue(true) };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const redis = {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    setIfNotExists: jest.fn().mockResolvedValue(true),
    incrementWithTtl: jest.fn().mockResolvedValue({ count: 1, ttlSeconds: 3600 }),
    decrementIfPositive: jest.fn().mockResolvedValue(0),
    ttl: jest.fn().mockResolvedValue(-2), // -2: the key does not exist
  };
  const guestHold = makeGuestHold();
  const service = new RegistrationsService(
    prisma as any,
    email as any,
    audit as any,
    {} as any,
    {} as any,
    redis as any,
    undefined,
    guestHold.service,
    {} as any,
  );
  return { service, prisma, email, audit, redis, guestHold };
}

describe('RegistrationsService guest access', () => {
  it('creates a registration-scoped token and stores only its hash', async () => {
    const { service } = makeService();
    const createImpl = jest
      .spyOn(service as any, 'createImpl')
      .mockResolvedValue({ id: 'registration-1', guestAccessTokenHash: 'internal-secret' });

    const result = await service.createGuest(
      {
        eventId: 'event-1',
        tierId: 'tier-1',
        attendeeCount: 1,
        guestEmail: ' Guest@Example.com ',
        accountConsent: false,
      } as any,
      '127.0.0.1',
    );

    const storedHash = createImpl.mock.calls[0][4] as string;
    expect(result.guestAccessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(storedHash).toHaveLength(64);
    expect(storedHash).toBe(
      createHash('sha256').update(result.guestAccessToken).digest('hex'),
    );
    expect(storedHash).not.toBe(result.guestAccessToken);
    expect(createImpl.mock.calls[0][3]).toBe('guest@example.com');
  });

  it('passes complete free guest attendee details into the atomic registration create', async () => {
    const { service } = makeService();
    const createImpl = jest
      .spyOn(service as any, 'createImpl')
      .mockResolvedValue({ id: 'registration-1' });
    const attendees = [
      { firstName: 'Grace', lastName: 'Tester', email: 'guest@example.com' },
    ];

    await service.createGuest({
      eventId: 'event-1',
      tierId: 'tier-1',
      guestEmail: 'guest@example.com',
      attendees,
      accountConsent: false,
    } as any);

    expect(createImpl.mock.calls[0][0]).toEqual(
      expect.objectContaining({ attendees, guestEmail: 'guest@example.com' }),
    );
  });

  it('refuses the guest endpoint when account activation consent was granted', async () => {
    const { service } = makeService();

    await expect(
      service.createGuest({
        eventId: 'event-1',
        tierId: 'tier-1',
        attendeeCount: 1,
        guestEmail: 'guest@example.com',
        accountConsent: true,
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a paid guest intent without accepting or storing an email', async () => {
    const { service } = makeService();
    const createImpl = jest
      .spyOn(service as any, 'createImpl')
      .mockResolvedValue({ id: 'registration-1' });

    const result = await service.createGuestIntent({
      eventId: 'event-1',
      tierId: 'tier-1',
      attendeeCount: 2,
      accountConsent: false,
    } as any);

    expect(result).not.toHaveProperty('guestEmail');
    expect(result.guestAccessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createImpl.mock.calls[0][1]).toBeNull();
    expect(createImpl.mock.calls[0][3]).toBeUndefined();
    expect(createImpl.mock.calls[0][5]).toBe(true);
  });

  it('rejects identity data sent before paid payment proof', async () => {
    const { service } = makeService();

    await expect(
      service.createGuestIntent({
        eventId: 'event-1',
        tierId: 'tier-1',
        attendeeCount: 1,
        guestEmail: 'guest@example.com',
        accountConsent: false,
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns the guest registration only for the matching scoped token', async () => {
    const { service, prisma } = makeService();
    const token = 'valid-registration-scoped-token';
    prisma.registration.findFirst.mockResolvedValue({
      id: 'registration-1',
      guestAccessTokenHash: createHash('sha256').update(token).digest('hex'),
    });
    prisma.registration.findUnique.mockResolvedValue({
      id: 'registration-1',
      guestAccessTokenHash: createHash('sha256').update(token).digest('hex'),
      attendees: [],
      proofs: [],
    });

    const result = await service.findGuestById('registration-1', token);

    expect(result).toEqual({
      id: 'registration-1',
      attendees: [],
      proofs: [],
      holdExpiresAt: null,
      resumeEmailSaved: false,
    });
  });

  it('uses the same not-found response for missing and invalid scoped tokens', async () => {
    const { service, prisma } = makeService();
    prisma.registration.findFirst.mockResolvedValue({
      id: 'registration-1',
      guestAccessTokenHash: createHash('sha256').update('correct-token').digest('hex'),
    });

    await expect(
      service.findGuestById('registration-1', 'wrong-token'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.findGuestById('registration-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.registration.findUnique).not.toHaveBeenCalled();
  });

  it('does not allow the legacy attendee endpoint to bypass paid guest OTP', async () => {
    const { service, prisma } = makeService();
    const token = 'valid-registration-scoped-token';
    prisma.registration.findFirst.mockResolvedValue({
      id: 'registration-1',
      guestAccessTokenHash: createHash('sha256').update(token).digest('hex'),
    });
    prisma.registration.findUnique.mockResolvedValue({
      guestEmail: null,
      total: 500,
    });

    await expect(
      service.updateGuestAttendees(
        'registration-1',
        token,
        { attendees: [] } as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps the pre-confirmation guest email transient and hashed', async () => {
    const { service, prisma, email, redis } = makeService();
    const token = 'valid-registration-scoped-token';
    prisma.registration.findFirst.mockResolvedValue({
      id: 'registration-1',
      guestAccessTokenHash: createHash('sha256').update(token).digest('hex'),
    });
    prisma.registration.findUnique.mockResolvedValue({
      status: 'proof_submitted',
      total: 500,
      attendeesCompletedAt: null,
    });

    await service.requestGuestConfirmationCode(
      'registration-1',
      token,
      ' Guest@Example.com ',
    );

    expect(email.sendOtpEmail).toHaveBeenCalledWith('guest@example.com', expect.stringMatching(/^\d{6}$/));
    const storedRecord = redis.set.mock.calls[0][1] as string;
    expect(storedRecord).not.toContain('guest@example.com');
    expect(JSON.parse(storedRecord)).toEqual({
      codeHash: expect.any(String),
      emailHash: createHash('sha256').update('guest@example.com').digest('hex'),
    });
    expect(prisma).not.toHaveProperty('user');
  });

  describe('guest confirmation code cooldown', () => {
    const token = 'valid-registration-scoped-token';
    const sha = (value: string) => createHash('sha256').update(value).digest('hex');

    function readyOrder(prisma: ReturnType<typeof makeService>['prisma']) {
      prisma.registration.findFirst.mockResolvedValue({
        id: 'registration-1',
        guestAccessTokenHash: sha(token),
      });
      prisma.registration.findUnique.mockResolvedValue({
        status: 'proof_submitted',
        total: 500,
        attendeesCompletedAt: null,
        eventId: 'event-1',
      });
    }

    it('keeps one cooldown per order AND address, so a corrected address is not blocked', async () => {
      const { service, prisma, redis } = makeService();
      readyOrder(prisma);

      await service.requestGuestConfirmationCode('registration-1', token, 'wrong@example.com');
      await service.requestGuestConfirmationCode('registration-1', token, 'right@example.com');

      const keys = redis.setIfNotExists.mock.calls.map((call) => call[0] as string);
      expect(keys).toHaveLength(2);
      expect(keys[0]).not.toBe(keys[1]);
      keys.forEach((key) => expect(key).toMatch(/^guest-checkout-otp-cooldown:registration-1:[0-9a-f]{16}$/));
      expect(keys.join()).not.toContain('example.com');
    });

    it('tells the buyer how many seconds are left and whether the sent code still works', async () => {
      const { service, prisma, redis, email } = makeService();
      readyOrder(prisma);
      redis.setIfNotExists.mockResolvedValue(false);
      redis.ttl.mockResolvedValue(37);
      redis.get.mockResolvedValue(
        JSON.stringify({ codeHash: 'x', emailHash: sha('guest@example.com') }),
      );

      const attempt = service.requestGuestConfirmationCode('registration-1', token, 'guest@example.com');

      await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
      await attempt.catch((error: BadRequestException) => {
        expect(error.getResponse()).toEqual({
          message: 'Please wait 37 seconds before requesting a new code.',
          code: 'OTP_COOLDOWN',
          retryAfterSeconds: 37,
          codeActive: true,
        });
      });
      expect(email.sendOtpEmail).not.toHaveBeenCalled();
    });

    it('does not claim the earlier code is usable when it was sent to a different address', async () => {
      const { service, prisma, redis } = makeService();
      readyOrder(prisma);
      redis.setIfNotExists.mockResolvedValue(false);
      redis.get.mockResolvedValue(
        JSON.stringify({ codeHash: 'x', emailHash: sha('someone-else@example.com') }),
      );

      await service
        .requestGuestConfirmationCode('registration-1', token, 'guest@example.com')
        .catch((error: BadRequestException) => {
          expect(error.getResponse()).toEqual(expect.objectContaining({ codeActive: false }));
        });
    });

    it('stops one order from trying more than six codes an hour across addresses', async () => {
      const { service, prisma, redis, email } = makeService();
      readyOrder(prisma);
      redis.incrementWithTtl.mockResolvedValue({ count: 7, ttlSeconds: 1800 });

      await expect(
        service.requestGuestConfirmationCode('registration-1', token, 'seventh@example.com'),
      ).rejects.toMatchObject({ status: 429 });
      expect(email.sendOtpEmail).not.toHaveBeenCalled();
      expect(redis.del).toHaveBeenCalledTimes(1);
    });

    it('gives the wait back when the mail server reports a failure', async () => {
      const { service, prisma, redis, email } = makeService();
      readyOrder(prisma);
      email.sendOtpEmail.mockResolvedValue(false);

      await expect(
        service.requestGuestConfirmationCode('registration-1', token, 'guest@example.com'),
      ).rejects.toBeInstanceOf(BadRequestException);

      const deleted = redis.del.mock.calls.map((call) => call[0] as string);
      expect(deleted).toContain('guest-checkout-otp:registration-1');
      expect(deleted.some((key) => key.startsWith('guest-checkout-otp-cooldown:registration-1:'))).toBe(true);
      expect(redis.decrementIfPositive).toHaveBeenCalledWith('guest-checkout-otp-sends:registration-1');
    });

    it('answers a retry inside the wait from Redis alone, before any database lookup', async () => {
      const { service, prisma, redis, email } = makeService();
      readyOrder(prisma);
      redis.ttl.mockResolvedValue(30);

      await expect(
        service.requestGuestConfirmationCode('registration-1', token, 'guest@example.com'),
      ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'OTP_COOLDOWN', retryAfterSeconds: 30 }) });

      expect(prisma.registration.findMany).not.toHaveBeenCalled();
      expect(redis.setIfNotExists).not.toHaveBeenCalled();
      expect(email.sendOtpEmail).not.toHaveBeenCalled();
    });

    it('starts a new code with a fresh attempts counter and tells the client how long to wait', async () => {
      const { service, prisma, redis } = makeService();
      readyOrder(prisma);

      const result = await service.requestGuestConfirmationCode('registration-1', token, 'guest@example.com');

      expect(redis.del).toHaveBeenCalledWith('guest-checkout-otp-attempts:registration-1');
      expect(result).toEqual(expect.objectContaining({ retryAfterSeconds: 60 }));
    });

    it('gives the wait back when Redis fails before anything is sent', async () => {
      const { service, prisma, redis, email } = makeService();
      readyOrder(prisma);
      redis.incrementWithTtl.mockRejectedValue(new Error('redis unavailable'));

      await expect(
        service.requestGuestConfirmationCode('registration-1', token, 'guest@example.com'),
      ).rejects.toThrow('redis unavailable');

      const deleted = redis.del.mock.calls.map((call) => call[0] as string);
      expect(deleted.some((key) => key.startsWith('guest-checkout-otp-cooldown:registration-1:'))).toBe(true);
      expect(email.sendOtpEmail).not.toHaveBeenCalled();
    });

    it('gives the wait back when the mail server throws', async () => {
      const { service, prisma, redis, email } = makeService();
      readyOrder(prisma);
      email.sendOtpEmail.mockRejectedValue(new Error('socket hang up'));

      await expect(
        service.requestGuestConfirmationCode('registration-1', token, 'guest@example.com'),
      ).rejects.toBeInstanceOf(BadRequestException);

      const deleted = redis.del.mock.calls.map((call) => call[0] as string);
      expect(deleted.some((key) => key.startsWith('guest-checkout-otp-cooldown:registration-1:'))).toBe(true);
    });

    it('answers within the time budget when the mail server hangs, and releases the wait only', async () => {
      // Only the budget timer is faked; bcrypt needs the real setImmediate/nextTick to finish.
      jest.useFakeTimers({ doNotFake: ['setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask'] });
      try {
        const { service, prisma, redis, email } = makeService();
        readyOrder(prisma);
        email.sendOtpEmail.mockReturnValue(new Promise<boolean>(() => undefined));

        const attempt = service
          .requestGuestConfirmationCode('registration-1', token, 'guest@example.com')
          .catch((error: BadRequestException) => error);
        // Wait until the request is actually waiting on the mail server, then let the budget run out.
        while (email.sendOtpEmail.mock.calls.length === 0) {
          await new Promise<void>((resolve) => setImmediate(resolve));
        }
        await jest.advanceTimersByTimeAsync(20_000);
        const error = await attempt;

        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).message).toMatch(/taking longer than usual/);
        const deleted = redis.del.mock.calls.map((call) => call[0] as string);
        // The mail may still arrive, so the stored code is kept; only the wait is released.
        expect(deleted).not.toContain('guest-checkout-otp:registration-1');
        expect(deleted.some((key) => key.startsWith('guest-checkout-otp-cooldown:registration-1:'))).toBe(true);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('guest email claims', () => {
    const sha = (value: string) => createHash('sha256').update(value).digest('hex');

    function fakeTx(options: {
      claims: Array<{ id: string; registrationId: string }>;
      activeOrderIds: string[];
    }) {
      return {
        guestRegistrationEmailClaim: {
          findMany: jest.fn().mockResolvedValue(options.claims),
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        registration: {
          findMany: jest.fn().mockResolvedValue(options.activeOrderIds.map((id) => ({ id }))),
        },
      };
    }

    it('drops a claim left by an order that was rejected or cancelled', async () => {
      const { service } = makeService();
      const tx = fakeTx({ claims: [{ id: 'claim-1', registrationId: 'old-order' }], activeOrderIds: [] });

      await (service as any).releaseStaleGuestEmailClaimsTx(tx, 'event-1', 'new-order', [sha('a@example.com')]);

      expect(tx.guestRegistrationEmailClaim.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['claim-1'] } },
      });
    });

    it('keeps a claim whose order is still active, so the database still refuses the duplicate', async () => {
      const { service } = makeService();
      const tx = fakeTx({ claims: [{ id: 'claim-1', registrationId: 'live-order' }], activeOrderIds: ['live-order'] });

      await (service as any).releaseStaleGuestEmailClaimsTx(tx, 'event-1', 'new-order', [sha('a@example.com')]);

      expect(tx.guestRegistrationEmailClaim.deleteMany).not.toHaveBeenCalled();
    });

    it('drops only the stale claims when an order has both kinds', async () => {
      const { service } = makeService();
      const tx = fakeTx({
        claims: [
          { id: 'claim-live', registrationId: 'live-order' },
          { id: 'claim-old', registrationId: 'old-order' },
        ],
        activeOrderIds: ['live-order'],
      });

      await (service as any).releaseStaleGuestEmailClaimsTx(tx, 'event-1', 'new-order', [
        sha('a@example.com'),
        sha('b@example.com'),
      ]);

      expect(tx.guestRegistrationEmailClaim.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['claim-old'] } },
      });
    });

    it('drops and remakes a claim this same order left behind by an earlier try', async () => {
      const { service } = makeService();
      const tx = fakeTx({ claims: [{ id: 'claim-own', registrationId: 'new-order' }], activeOrderIds: [] });

      await (service as any).releaseStaleGuestEmailClaimsTx(tx, 'event-1', 'new-order', [sha('a@example.com')]);

      expect(tx.registration.findMany).not.toHaveBeenCalled();
      expect(tx.guestRegistrationEmailClaim.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['claim-own'] } },
      });
    });

    it('clears stale claims before it claims, inside the same transaction as the attendee save', async () => {
      const { service, prisma } = makeService();
      const calls: string[] = [];
      const tx = {
        guestRegistrationEmailClaim: {
          findMany: jest.fn().mockImplementation(async () => {
            calls.push('look-for-claims');
            return [{ id: 'claim-old', registrationId: 'old-order' }];
          }),
          deleteMany: jest.fn().mockImplementation(async () => {
            calls.push('drop-stale-claims');
            return { count: 1 };
          }),
          createMany: jest.fn().mockImplementation(async () => {
            calls.push('claim-emails');
            return { count: 2 };
          }),
        },
        registration: {
          findMany: jest.fn().mockResolvedValue([]),
          update: jest.fn().mockImplementation(async () => {
            calls.push('save-registration');
          }),
        },
        attendee: {
          createMany: jest.fn().mockImplementation(async () => {
            calls.push('save-attendees');
          }),
        },
      };
      (prisma as any).$transaction = jest.fn().mockImplementation(async (run: (client: unknown) => unknown) => run(tx));
      prisma.registration.findFirst.mockResolvedValue({
        id: 'registration-1',
        referenceNumber: 'REF-1',
        status: 'proof_submitted',
        userId: null,
        attendeeCount: 2,
        total: 500,
        attendees: [],
        event: { id: 'event-1', title: 'Event', slug: 'event', eventType: 'conference', runningConfig: null, startsAt: new Date() },
      });
      jest.spyOn(service as any, 'sendSubmissionEmails').mockResolvedValue(undefined);

      await (service as any).updateAttendeesForRegistration(
        'registration-1',
        null,
        {
          attendees: [
            { firstName: 'Ana', lastName: 'One', email: 'one@example.com' },
            { firstName: 'Ben', lastName: 'Two', email: 'two@example.com' },
          ],
        },
        true,
      );

      expect(calls.indexOf('drop-stale-claims')).toBeGreaterThan(-1);
      expect(calls.indexOf('drop-stale-claims')).toBeLessThan(calls.indexOf('claim-emails'));
      expect(calls.indexOf('claim-emails')).toBeLessThan(calls.indexOf('save-registration'));
      expect(tx.guestRegistrationEmailClaim.createMany).toHaveBeenCalledWith({
        data: [
          { eventId: 'event-1', registrationId: 'registration-1', emailHash: sha('one@example.com') },
          { eventId: 'event-1', registrationId: 'registration-1', emailHash: sha('two@example.com') },
        ],
      });
    });

    it('does nothing when no claim exists for the emails', async () => {
      const { service } = makeService();
      const tx = fakeTx({ claims: [], activeOrderIds: [] });

      await (service as any).releaseStaleGuestEmailClaimsTx(tx, 'event-1', 'new-order', [sha('a@example.com')]);

      expect(tx.registration.findMany).not.toHaveBeenCalled();
      expect(tx.guestRegistrationEmailClaim.deleteMany).not.toHaveBeenCalled();
    });
  });

  it('returns only masked duplicate details to a scoped guest checkout', async () => {
    const { service, prisma } = makeService();
    const token = 'valid-registration-scoped-token';
    prisma.registration.findFirst.mockResolvedValue({
      id: 'registration-1',
      guestAccessTokenHash: createHash('sha256').update(token).digest('hex'),
    });
    prisma.registration.findUnique.mockResolvedValue({ eventId: 'event-1' });
    prisma.registration.findMany.mockResolvedValue([
      {
        referenceNumber: 'AXN-2026-SECRET',
        guestEmail: null,
        createdAt: new Date('2026-07-30T00:00:00.000Z'),
        attendees: [{ firstName: 'Maria', lastName: 'Santos', email: 'guest@example.com' }],
      },
    ]);

    const result = await service.checkGuestDuplicates(
      'registration-1',
      token,
      [' Guest@Example.com '],
    );

    expect(result.conflicts).toEqual([
      {
        email: 'guest@example.com',
        attendeeName: 'M*** S***',
        transactionDate: '2026-07-30T00:00:00.000Z',
        referenceNumber: '••••CRET',
      },
    ]);
    expect(result.conflicts[0].attendeeName).not.toContain('Maria');
    expect(result.conflicts[0].referenceNumber).not.toContain('AXN-2026');
  });
});
