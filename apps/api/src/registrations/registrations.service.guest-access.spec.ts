import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { RegistrationsService } from './registrations.service';

function makeService() {
  const prisma = {
    registration: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
  };
  const email = { sendOtpEmail: jest.fn().mockResolvedValue(true) };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const redis = {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    setIfNotExists: jest.fn().mockResolvedValue(true),
    incrementWithTtl: jest.fn(),
  };
  const service = new RegistrationsService(
    prisma as any,
    email as any,
    audit as any,
    {} as any,
    {} as any,
    redis as any,
  );
  return { service, prisma, email, audit, redis };
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
});
