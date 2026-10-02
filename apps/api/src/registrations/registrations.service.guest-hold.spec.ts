import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { RegistrationsService } from './registrations.service';
import { makeGuestHold } from './guest-hold.testing';

const REG = '3f2a1b9c-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const TOKEN = 'valid-registration-scoped-token';
const HASH = createHash('sha256').update(TOKEN).digest('hex');
const IP = '203.0.113.7';
const NOW = new Date('2026-10-02T10:00:00.000Z');

function makeService(guestOverrides: Record<string, unknown> = {}) {
  const prisma = {
    registration: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const email = { sendGuestResumeEmail: jest.fn().mockResolvedValue(true) };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const guest = makeGuestHold(guestOverrides);
  const holds = { releasePendingHold: jest.fn().mockResolvedValue({ released: true }) };
  const service = new RegistrationsService(
    prisma as never,
    email as never,
    audit as never,
    guest.config as never,
    {} as never,
    guest.redis as never,
    undefined,
    guest.service,
    holds as never,
  );
  return { service, prisma, email, audit, holds, guest };
}

/** Token matches, and the registration looks like an unpaid guest hold. */
function unpaidGuestHold(
  prisma: ReturnType<typeof makeService>['prisma'],
  overrides: Record<string, unknown> = {},
) {
  prisma.registration.findFirst.mockResolvedValue({ id: REG, guestAccessTokenHash: HASH });
  prisma.registration.findUnique.mockResolvedValue({
    status: 'pending_payment',
    total: 550,
    eventId: 'event-1',
    createdAt: new Date(NOW.getTime() - 5 * 60_000),
    holdExpiresAt: new Date(NOW.getTime() + 55 * 60_000),
    referenceNumber: 'AXN-2026-ABCDE',
    guestResumeEmail: null,
    event: { slug: 'glee-cabaret', title: 'WAIT… this song was on glee' },
    ...overrides,
  });
}

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout'] });
  jest.setSystemTime(NOW);
});
afterEach(() => jest.useRealTimers());

describe('createGuestIntent: hold deadline and cap', () => {
  const dto = { eventId: 'event-1', tierId: 'tier-1', attendeeCount: 1, accountConsent: false } as never;

  it('gives the new hold a server-set 60-minute deadline and binds its counter slot', async () => {
    const { service, guest } = makeService();
    const createImpl = jest
      .spyOn(service as never, 'createImpl' as never)
      .mockResolvedValue({ id: REG, holdExpiresAt: 'x' } as never);

    await service.createGuestIntent(dto, IP);

    const deadline = (createImpl.mock.calls[0] as unknown[])[6] as Date;
    expect(deadline).toEqual(new Date(NOW.getTime() + 60 * 60_000));
    expect(guest.redis.store.get(`guest-hold-reg:${REG}`)).toMatch(/^guest-hold:event-1:/);
  });

  it('refuses the hold over the cap with a 409 that carries a stable code, and creates nothing', async () => {
    const { service } = makeService({ 'guestHold.perIp': 1 });
    const createImpl = jest.spyOn(service as never, 'createImpl' as never).mockResolvedValue({ id: REG } as never);

    await service.createGuestIntent(dto, IP);
    const blocked = service.createGuestIntent(dto, IP);

    await expect(blocked).rejects.toBeInstanceOf(ConflictException);
    // The Nest default handler and the Sentry filter both return this body unchanged.
    await expect(blocked).rejects.toMatchObject({
      response: { code: 'GUEST_HOLD_LIMIT', message: expect.stringContaining('Too many reservations') },
    });
    expect(createImpl).toHaveBeenCalledTimes(1);
  });

  it('gives the slot back when the registration could not be created', async () => {
    const { service, guest } = makeService({ 'guestHold.perIp': 1 });
    jest.spyOn(service as never, 'createImpl' as never).mockRejectedValueOnce(new BadRequestException('sold out') as never);

    await expect(service.createGuestIntent(dto, IP)).rejects.toBeInstanceOf(BadRequestException);
    const slot = await guest.service.acquireCreateSlot('event-1', IP);
    expect(slot.allowed).toBe(true); // the failed attempt did not use up the only slot
  });

  it('rejects add-ons on a guest hold before touching any counter', async () => {
    const { service, guest } = makeService();
    const createImpl = jest.spyOn(service as never, 'createImpl' as never);

    await expect(
      service.createGuestIntent({ ...(dto as object), quoteToken: 'quote-1' } as never, IP),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createGuestIntent(
        { ...(dto as object), inclusionSelections: [{ variantId: 'v1', quantity: 1 }] } as never,
        IP,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(createImpl).not.toHaveBeenCalled();
    expect(guest.redis.store.size).toBe(0);
  });

  it('keeps checkout working when Redis is down (the cap fails open)', async () => {
    const { service, guest } = makeService();
    guest.redis.outage = true;
    jest.spyOn(service as never, 'createImpl' as never).mockResolvedValue({ id: REG } as never);
    await expect(service.createGuestIntent(dto, IP)).resolves.toMatchObject({ id: REG });
  });
});

describe('guest and admin responses never leak secrets', () => {
  it('findGuestById returns neither the token hash nor the resume email, only a flag and the deadline', async () => {
    const { service, prisma } = makeService();
    prisma.registration.findFirst.mockResolvedValue({ id: REG, guestAccessTokenHash: HASH });
    prisma.registration.findUnique.mockResolvedValue({
      id: REG,
      guestAccessTokenHash: HASH,
      guestResumeEmail: 'secret@example.com',
      holdExpiresAt: new Date('2026-10-03T10:00:00.000Z'),
      attendees: [],
      proofs: [],
    });

    const result = await service.findGuestById(REG, TOKEN);

    expect(result).not.toHaveProperty('guestAccessTokenHash');
    expect(result).not.toHaveProperty('guestResumeEmail');
    expect(JSON.stringify(result)).not.toContain('secret@example.com');
    expect(result).toMatchObject({ resumeEmailSaved: true, holdExpiresAt: '2026-10-03T10:00:00.000Z' });
  });

  it('findByIdAdmin hides the token hash and the resume email from organizers', async () => {
    const { service, prisma } = makeService();
    prisma.registration.findUnique.mockResolvedValue({
      id: REG,
      currency: 'PHP',
      guestAccessTokenHash: HASH,
      guestResumeEmail: 'secret@example.com',
      holdExpiresAt: null,
      lineItems: [],
      attendees: [],
      proofs: [],
    });

    const result = await service.findByIdAdmin(REG);

    expect(result).not.toHaveProperty('guestAccessTokenHash');
    expect(result).not.toHaveProperty('guestResumeEmail');
    expect(JSON.stringify(result)).not.toContain(HASH);
    expect(result).toMatchObject({ resumeEmailSaved: true, holdExpiresAt: null });
  });
});

describe('saveGuestForLater', () => {
  it('emails a resume link, extends the hold to 24 hours and keeps the email out of guest_email', async () => {
    const { service, prisma, email, audit, guest } = makeService();
    unpaidGuestHold(prisma);

    const result = await service.saveGuestForLater(REG, TOKEN, 'Guest@Example.com', IP);

    const expectedDeadline = new Date(NOW.getTime() + 24 * 3_600_000);
    expect(result).toEqual({
      message: 'If the address is right, your link is on its way.',
      holdExpiresAt: expectedDeadline.toISOString(),
    });
    expect(prisma.registration.updateMany).toHaveBeenCalledWith({
      where: { id: REG, userId: null, status: 'pending_payment' },
      data: { guestResumeEmail: 'guest@example.com', holdExpiresAt: expectedDeadline },
    });
    // The unverified email must never be stored where "guestEmail is set" means "OTP not needed".
    const written = prisma.registration.updateMany.mock.calls[0][0].data;
    expect(written).not.toHaveProperty('guestEmail');

    const [to, mail] = email.sendGuestResumeEmail.mock.calls[0];
    expect(to).toBe('guest@example.com');
    expect(mail.holdExpiresAt).toEqual(expectedDeadline);
    expect(mail.resumeUrl).toMatch(
      /^https:\/\/axontickets\.online\/events\/glee-cabaret\/register\/resume#t=v1\.[0-9a-f-]{36}\.\d+\.[A-Za-z0-9_-]{43}$/,
    );
    const token = mail.resumeUrl.split('#t=')[1] as string;
    expect(guest.service.verifyResumeToken(token)).toMatchObject({ registrationId: REG, expiresAt: expectedDeadline });

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'GUEST_HOLD_EMAIL_SAVED', metadata: { extended: true } }),
    );
    expect(JSON.stringify(audit.log.mock.calls)).not.toContain('example.com');
  });

  it('still sends the link but does not extend the hold once the extended-hold cap is used up', async () => {
    const { service, prisma, email, audit, guest } = makeService({ 'guestHold.extendedPerIp': 1 });
    unpaidGuestHold(prisma);
    await guest.service.acquireExtendedSlot('event-1', IP); // the one allowed extension is already taken

    const result = await service.saveGuestForLater(REG, TOKEN, 'guest@example.com', IP);

    const unchangedDeadline = new Date(NOW.getTime() + 55 * 60_000);
    expect(result.holdExpiresAt).toBe(unchangedDeadline.toISOString()); // the page shows the TRUE deadline
    expect(email.sendGuestResumeEmail).toHaveBeenCalledTimes(1);
    expect(email.sendGuestResumeEmail.mock.calls[0][1].holdExpiresAt).toEqual(unchangedDeadline);
    expect(prisma.registration.updateMany).not.toHaveBeenCalled(); // no email stored either
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ metadata: { extended: false } }));
  });

  it('sends nothing, changes nothing and answers the same way when a recipient limit is hit', async () => {
    const { service, prisma, email, guest } = makeService();
    unpaidGuestHold(prisma);
    for (let i = 0; i < 3; i++) {
      await guest.service.allowResumeEmail({ registrationId: `other-${i}`, email: 'guest@example.com', ip: `10.0.0.${i}` });
    }

    const result = await service.saveGuestForLater(REG, TOKEN, 'guest@example.com', IP);

    expect(result.message).toBe('If the address is right, your link is on its way.');
    expect(result.holdExpiresAt).toBe(new Date(NOW.getTime() + 55 * 60_000).toISOString());
    expect(email.sendGuestResumeEmail).not.toHaveBeenCalled();
    expect(prisma.registration.updateMany).not.toHaveBeenCalled();
  });

  it('fails closed when Redis is down: no email, no extension, same reply shape', async () => {
    const { service, prisma, email, guest } = makeService();
    unpaidGuestHold(prisma);
    guest.redis.outage = true;

    const result = await service.saveGuestForLater(REG, TOKEN, 'guest@example.com', IP);

    expect(result).toEqual({
      message: 'If the address is right, your link is on its way.',
      holdExpiresAt: new Date(NOW.getTime() + 55 * 60_000).toISOString(),
    });
    expect(email.sendGuestResumeEmail).not.toHaveBeenCalled();
    expect(prisma.registration.updateMany).not.toHaveBeenCalled();
  });

  it('answers 503 and leaves the hold untouched when the mail provider fails', async () => {
    const { service, prisma, email } = makeService();
    unpaidGuestHold(prisma);
    email.sendGuestResumeEmail.mockResolvedValueOnce(false);

    await expect(service.saveGuestForLater(REG, TOKEN, 'guest@example.com', IP)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(prisma.registration.updateMany).not.toHaveBeenCalled();
  });

  it('on a resend, updates the address without consuming another extended slot or moving the deadline', async () => {
    const { service, prisma, guest } = makeService({ 'guestHold.extendedPerIp': 1 });
    unpaidGuestHold(prisma, {
      guestResumeEmail: 'first@example.com',
      holdExpiresAt: new Date(NOW.getTime() + 20 * 3_600_000),
    });
    const spy = jest.spyOn(guest.service, 'acquireExtendedSlot');

    await service.saveGuestForLater(REG, TOKEN, 'second@example.com', IP);

    expect(spy).not.toHaveBeenCalled();
    expect(prisma.registration.updateMany).toHaveBeenCalledWith({
      where: { id: REG, userId: null, status: 'pending_payment' },
      data: { guestResumeEmail: 'second@example.com' },
    });
  });

  it('treats a row with no stored deadline as the legacy 24-hour hold and never extends it', async () => {
    const { service, prisma, email } = makeService();
    unpaidGuestHold(prisma, { holdExpiresAt: null, createdAt: new Date(NOW.getTime() - 2 * 3_600_000) });

    const result = await service.saveGuestForLater(REG, TOKEN, 'guest@example.com', IP);

    const legacyDeadline = new Date(NOW.getTime() + 22 * 3_600_000);
    expect(result.holdExpiresAt).toBe(legacyDeadline.toISOString());
    expect(email.sendGuestResumeEmail.mock.calls[0][1].holdExpiresAt).toEqual(legacyDeadline);
    expect(prisma.registration.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a reservation that is no longer an unpaid hold, or a free one', async () => {
    const { service, prisma, email } = makeService();
    unpaidGuestHold(prisma, { status: 'cancelled' });
    await expect(service.saveGuestForLater(REG, TOKEN, 'guest@example.com', IP)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    unpaidGuestHold(prisma, { total: 0 });
    await expect(service.saveGuestForLater(REG, TOKEN, 'guest@example.com', IP)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(email.sendGuestResumeEmail).not.toHaveBeenCalled();
  });

  it('loses cleanly to a concurrent cancel or proof upload (the conditional write matches nothing)', async () => {
    const { service, prisma } = makeService();
    unpaidGuestHold(prisma);
    prisma.registration.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.saveGuestForLater(REG, TOKEN, 'guest@example.com', IP)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a wrong or missing token before doing anything else', async () => {
    const { service, prisma, email } = makeService();
    unpaidGuestHold(prisma);

    await expect(service.saveGuestForLater(REG, 'wrong-token', 'guest@example.com', IP)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.saveGuestForLater(REG, undefined, 'guest@example.com', IP)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(email.sendGuestResumeEmail).not.toHaveBeenCalled();
  });
});

describe('resumeGuest', () => {
  function validToken(guest: ReturnType<typeof makeService>['guest']) {
    return guest.service.signResumeToken(REG, new Date(NOW.getTime() + 3_600_000));
  }
  const pendingRow = {
    id: REG,
    guestAccessTokenHash: HASH,
    holdExpiresAt: new Date('2026-10-03T10:00:00.000Z'),
    event: { slug: 'glee-cabaret' },
  };

  it('rotates the access token and returns the new one with the event slug and deadline', async () => {
    const { service, prisma, audit, guest } = makeService();
    prisma.registration.findFirst.mockResolvedValue(pendingRow);

    const result = await service.resumeGuest(validToken(guest), IP);

    expect(result.registrationId).toBe(REG);
    expect(result.eventSlug).toBe('glee-cabaret');
    expect(result.holdExpiresAt).toBe('2026-10-03T10:00:00.000Z');
    expect(result.guestAccessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const update = prisma.registration.updateMany.mock.calls[0][0];
    expect(update.where).toEqual({
      id: REG,
      userId: null,
      status: 'pending_payment',
      guestAccessTokenHash: HASH, // conditional on the hash just read: parallel exchanges cannot both win
    });
    expect(update.data.guestAccessTokenHash).toBe(
      createHash('sha256').update(result.guestAccessToken).digest('hex'),
    );
    expect(update.data.guestAccessTokenHash).not.toBe(HASH);
    expect(JSON.stringify(audit.log.mock.calls)).not.toContain(result.guestAccessToken);
  });

  it('answers every kind of failure with the same 404 and does no database work for a bad signature', async () => {
    const { service, prisma, guest } = makeService();
    const good = validToken(guest);
    const expired = guest.service.signResumeToken(REG, new Date(NOW.getTime() - 1_000));
    const tampered = good.replace(/.$/, good.endsWith('A') ? 'B' : 'A');

    const messages: string[] = [];
    for (const token of [tampered, expired, 'garbage', good.replace('v1', 'v2')]) {
      const error = await service.resumeGuest(token, IP).catch((e) => e);
      expect(error).toBeInstanceOf(NotFoundException);
      messages.push((error as NotFoundException).message);
    }
    expect(new Set(messages).size).toBe(1);
    expect(prisma.registration.findFirst).not.toHaveBeenCalled();
    expect(prisma.registration.updateMany).not.toHaveBeenCalled();
  });

  it('gives the same 404 when the reservation is gone, cancelled or already paid', async () => {
    const { service, prisma, guest } = makeService();
    prisma.registration.findFirst.mockResolvedValue(null);
    const gone = await service.resumeGuest(validToken(guest), IP).catch((e) => e);
    expect(gone).toBeInstanceOf(NotFoundException);
    expect((gone as NotFoundException).message).toBe('This link is no longer valid.');
    expect(prisma.registration.updateMany).not.toHaveBeenCalled();
  });

  it('lets exactly one of two parallel exchanges win', async () => {
    const { service, prisma, guest } = makeService();
    prisma.registration.findFirst.mockResolvedValue(pendingRow);
    prisma.registration.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const token = validToken(guest);

    const results = await Promise.allSettled([service.resumeGuest(token, IP), service.resumeGuest(token, IP)]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const loser = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(loser.reason).toBeInstanceOf(NotFoundException);
  });

  it('limits exchanges per IP, but only counts requests whose signature is genuine', async () => {
    const { service, prisma, guest } = makeService();
    prisma.registration.findFirst.mockResolvedValue(pendingRow);
    for (let i = 0; i < 30; i++) await service.resumeGuest('garbage', IP).catch(() => undefined);

    // Garbage never used up the limit, so a genuine link still works.
    await expect(service.resumeGuest(validToken(guest), IP)).resolves.toBeDefined();

    for (let i = 0; i < 25; i++) await service.resumeGuest(validToken(guest), IP).catch(() => undefined);
    const blocked = await service.resumeGuest(validToken(guest), IP).catch((e) => e);
    expect(blocked).toBeInstanceOf(HttpException);
    expect((blocked as HttpException).getStatus()).toBe(429);
  });
});

describe('cancelGuest', () => {
  it('releases the guest hold through the shared helper and says so in the audit trail', async () => {
    const { service, prisma, holds } = makeService();
    unpaidGuestHold(prisma);

    await expect(service.cancelGuest(REG, TOKEN)).resolves.toEqual({ message: 'Reservation cancelled' });
    expect(holds.releasePendingHold).toHaveBeenCalledWith(REG, {
      reason: 'Guest cancelled reservation',
      auditAction: 'REGISTRATION_CANCELLED',
      guestOnly: true,
      metadata: { by: 'guest' },
    });
  });

  it('does nothing for a wrong token', async () => {
    const { service, prisma, holds } = makeService();
    unpaidGuestHold(prisma);
    await expect(service.cancelGuest(REG, 'wrong')).rejects.toBeInstanceOf(NotFoundException);
    expect(holds.releasePendingHold).not.toHaveBeenCalled();
  });

  it('explains a proof that was already uploaded with a stable code', async () => {
    const { service, prisma, holds } = makeService();
    unpaidGuestHold(prisma);
    holds.releasePendingHold.mockResolvedValueOnce({ released: false, why: 'has_proof' });

    const error = await service.cancelGuest(REG, TOKEN).catch((e) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({ code: 'HAS_PROOF' });
  });

  it('reports an already-finished reservation as not cancellable, and hides foreign ones', async () => {
    const { service, prisma, holds } = makeService();
    unpaidGuestHold(prisma);
    holds.releasePendingHold.mockResolvedValueOnce({ released: false, why: 'not_pending' });
    const error = await service.cancelGuest(REG, TOKEN).catch((e) => e);
    expect((error as BadRequestException).getResponse()).toMatchObject({ code: 'NOT_PENDING' });

    holds.releasePendingHold.mockResolvedValueOnce({ released: false, why: 'not_guest' });
    await expect(service.cancelGuest(REG, TOKEN)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('releaseHoldByAdmin', () => {
  it('releases an unpaid hold as the acting admin and records an optional note', async () => {
    const { service, holds } = makeService();
    await expect(service.releaseHoldByAdmin(REG, 'admin-1', '  duplicate booking  ')).resolves.toEqual({
      message: 'Hold released',
    });
    expect(holds.releasePendingHold).toHaveBeenCalledWith(REG, {
      reason: 'Hold released by organizer',
      auditAction: 'REGISTRATION_HOLD_RELEASED',
      actorUserId: 'admin-1',
      metadata: { by: 'admin', note: 'duplicate booking' },
    });
  });

  it('omits the note when none is given', async () => {
    const { service, holds } = makeService();
    await service.releaseHoldByAdmin(REG, 'admin-1');
    expect(holds.releasePendingHold.mock.calls[0][1].metadata).toEqual({ by: 'admin' });
  });

  it('answers 404 for a missing registration and 400 when it is not an unpaid hold', async () => {
    const { service, holds } = makeService();
    holds.releasePendingHold.mockResolvedValueOnce({ released: false, why: 'not_found' });
    await expect(service.releaseHoldByAdmin(REG, 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
    for (const why of ['not_pending', 'has_proof'] as const) {
      holds.releasePendingHold.mockResolvedValueOnce({ released: false, why });
      await expect(service.releaseHoldByAdmin(REG, 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});
