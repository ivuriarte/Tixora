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
  const service = new RegistrationsService(
    prisma as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
  return { service, prisma };
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
});
