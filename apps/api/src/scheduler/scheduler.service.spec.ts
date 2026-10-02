import { SchedulerService } from './scheduler.service';

function makeScheduler(opts: { leadRegs?: object[]; guestHolds?: object[]; claim?: boolean } = {}) {
  const mockPrisma = {
    registration: {
      // First call: lead-attendee reminder query. Second call: guest-hold reminder query.
      findMany: jest
        .fn()
        .mockResolvedValueOnce(opts.leadRegs ?? [])
        .mockResolvedValueOnce(opts.guestHolds ?? []),
    },
  };
  const mockEmail = {
    sendPaymentReminderEmail: jest.fn().mockResolvedValue(undefined),
    sendGuestHoldReminderEmail: jest.fn().mockResolvedValue(true),
  };
  const mockAudit = { log: jest.fn() };
  const mockConfig = { get: jest.fn().mockReturnValue('https://axontickets.online') };
  const mockUpload = { deleteStoredImage: jest.fn().mockResolvedValue(undefined) };
  const guestHold = {
    claimReminder: jest.fn().mockResolvedValue(opts.claim ?? true),
    releaseReminderClaim: jest.fn().mockResolvedValue(undefined),
    signResumeToken: jest.fn().mockReturnValue('v1.signed-token'),
  };

  const service = new SchedulerService(
    mockPrisma as any,
    mockEmail as any,
    mockAudit as any,
    mockConfig as any,
    mockUpload as any,
    undefined,
    guestHold as any,
    {} as any,
  );
  return { service, mockPrisma, mockEmail, guestHold };
}

function pendingReg(id: string, email: string, firstName: string) {
  return {
    id,
    referenceNumber: `AX-${id}`,
    attendees: [{ id: `att_${id}`, isLead: true, email, firstName }],
    event: { title: 'Sample Event' },
  };
}

function guestHoldReg(id: string, email: string) {
  return {
    id,
    referenceNumber: `AX-${id}`,
    guestResumeEmail: email,
    holdExpiresAt: new Date('2026-10-03T09:30:00.000Z'),
    event: { title: 'Sample Event', slug: 'sample-event' },
  };
}

describe('SchedulerService — remindPendingRegistrations()', () => {
  it('returns { reminded: 0 } when no qualifying registrations exist', async () => {
    const { service } = makeScheduler();

    await expect(service.remindPendingRegistrations()).resolves.toEqual({ reminded: 0 });
  });

  it('sends a reminder email for each registration with a lead attendee, claiming each marker first', async () => {
    const regs = [
      pendingReg('reg_1', 'ana@example.com', 'Ana'),
      pendingReg('reg_2', 'ben@example.com', 'Ben'),
    ];
    const { service, mockEmail, guestHold } = makeScheduler({ leadRegs: regs });

    const result = await service.remindPendingRegistrations();

    expect(result).toEqual({ reminded: 2 });
    expect(guestHold.claimReminder).toHaveBeenCalledWith('reg_1');
    expect(guestHold.claimReminder).toHaveBeenCalledWith('reg_2');
    expect(mockEmail.sendPaymentReminderEmail).toHaveBeenCalledTimes(2);
    expect(mockEmail.sendPaymentReminderEmail).toHaveBeenCalledWith(
      'ana@example.com',
      'Ana',
      'AX-reg_1',
      'Sample Event',
      'https://axontickets.online/registrations/reg_1',
    );
  });

  it('skips registrations that have no lead attendee', async () => {
    const regWithNoLead = {
      id: 'reg_3',
      referenceNumber: 'AX-reg_3',
      attendees: [],
      event: { title: 'Sample Event' },
    };
    const { service, mockEmail } = makeScheduler({ leadRegs: [regWithNoLead] });

    const result = await service.remindPendingRegistrations();

    expect(result).toEqual({ reminded: 0 });
    expect(mockEmail.sendPaymentReminderEmail).not.toHaveBeenCalled();
  });

  it('continues with the remaining registrations when one email fails, and frees that marker for a retry', async () => {
    const regs = [
      pendingReg('reg_1', 'ana@example.com', 'Ana'),
      pendingReg('reg_2', 'ben@example.com', 'Ben'),
    ];
    const { service, mockEmail, guestHold } = makeScheduler({ leadRegs: regs });

    mockEmail.sendPaymentReminderEmail
      .mockRejectedValueOnce(new Error('SMTP timeout'))
      .mockResolvedValueOnce(undefined);

    const result = await service.remindPendingRegistrations();

    expect(result).toEqual({ reminded: 1 });
    expect(mockEmail.sendPaymentReminderEmail).toHaveBeenCalledTimes(2);
    expect(guestHold.releaseReminderClaim).toHaveBeenCalledTimes(1);
    expect(guestHold.releaseReminderClaim).toHaveBeenCalledWith('reg_1');
  });

  it('sends nothing when the once-only marker is already taken (a repeated 5-minute run)', async () => {
    const { service, mockEmail } = makeScheduler({
      leadRegs: [pendingReg('reg_1', 'ana@example.com', 'Ana')],
      guestHolds: [guestHoldReg('reg_g', 'guest@example.com')],
      claim: false,
    });

    await expect(service.remindPendingRegistrations()).resolves.toEqual({ reminded: 0 });
    expect(mockEmail.sendPaymentReminderEmail).not.toHaveBeenCalled();
    expect(mockEmail.sendGuestHoldReminderEmail).not.toHaveBeenCalled();
  });

  it('reminds a guest who saved an email, with a signed resume link in the URL fragment', async () => {
    const { service, mockEmail, guestHold } = makeScheduler({
      guestHolds: [guestHoldReg('reg_g', 'guest@example.com')],
    });

    await expect(service.remindPendingRegistrations()).resolves.toEqual({ reminded: 1 });

    expect(guestHold.signResumeToken).toHaveBeenCalledWith('reg_g', new Date('2026-10-03T09:30:00.000Z'));
    expect(mockEmail.sendGuestHoldReminderEmail).toHaveBeenCalledWith('guest@example.com', {
      eventTitle: 'Sample Event',
      referenceNumber: 'AX-reg_g',
      resumeUrl: 'https://axontickets.online/events/sample-event/register/resume#t=v1.signed-token',
      holdExpiresAt: new Date('2026-10-03T09:30:00.000Z'),
    });
  });

  it('frees the marker when the guest reminder cannot be sent', async () => {
    const { service, mockEmail, guestHold } = makeScheduler({
      guestHolds: [guestHoldReg('reg_g', 'guest@example.com')],
    });
    mockEmail.sendGuestHoldReminderEmail.mockResolvedValueOnce(false);

    await expect(service.remindPendingRegistrations()).resolves.toEqual({ reminded: 0 });
    expect(guestHold.releaseReminderClaim).toHaveBeenCalledWith('reg_g');
  });

  it('leaves guest holds to the guest loop, so the useless login link never takes their once-only marker', async () => {
    const { service, mockPrisma } = makeScheduler();
    await service.remindPendingRegistrations();

    const leadQuery = mockPrisma.registration.findMany.mock.calls[0][0];
    expect(leadQuery.where.OR).toEqual([{ userId: { not: null } }, { holdExpiresAt: null }]);
  });

  it('frees the marker and carries on when a guest reminder link cannot be built', async () => {
    const { service, guestHold, mockEmail } = makeScheduler({
      guestHolds: [guestHoldReg('reg_a', 'a@example.com'), guestHoldReg('reg_b', 'b@example.com')],
    });
    guestHold.signResumeToken.mockImplementationOnce(() => {
      throw new Error('no key material');
    });

    await expect(service.remindPendingRegistrations()).resolves.toEqual({ reminded: 1 });
    expect(guestHold.releaseReminderClaim).toHaveBeenCalledWith('reg_a');
    expect(mockEmail.sendGuestHoldReminderEmail).toHaveBeenCalledTimes(1);
  });

  it('queries guest holds by their stored deadline window and requires a saved email', async () => {
    const { service, mockPrisma } = makeScheduler();
    await service.remindPendingRegistrations();

    const guestQuery = mockPrisma.registration.findMany.mock.calls[1][0];
    expect(guestQuery.where).toEqual(
      expect.objectContaining({
        status: 'pending_payment',
        userId: null,
        guestResumeEmail: { not: null },
        holdExpiresAt: { gte: expect.any(Date), lte: expect.any(Date) },
      }),
    );
    expect(guestQuery.take).toBe(200);
  });
});

function makeCleanup(rows: { deadline?: string[]; legacy?: string[] } = {}) {
  const findMany = jest
    .fn()
    .mockResolvedValueOnce((rows.deadline ?? []).map((id) => ({ id })))
    .mockResolvedValueOnce((rows.legacy ?? []).map((id) => ({ id })));
  const holds = { releasePendingHold: jest.fn().mockResolvedValue({ released: true }) };
  const optionalInclusions = { expireDueReservations: jest.fn().mockResolvedValue(0) };
  const service = new SchedulerService(
    { registration: { findMany } } as any,
    {} as any,
    {} as any,
    { get: jest.fn() } as any,
    {} as any,
    optionalInclusions as any,
    {} as any,
    holds as any,
  );
  return { service, findMany, holds };
}

describe('SchedulerService — cleanupOrphanRegistrations()', () => {
  it('uses two explicit rules: deadline passed, or no deadline and older than 24 hours', async () => {
    const { service, findMany } = makeCleanup();
    await service.cleanupOrphanRegistrations();

    const [deadlineQuery, legacyQuery] = findMany.mock.calls.map((c) => c[0]);
    expect(deadlineQuery.where).toEqual({ status: 'pending_payment', holdExpiresAt: { lt: expect.any(Date) } });
    expect(legacyQuery.where).toEqual({
      status: 'pending_payment',
      holdExpiresAt: null,
      createdAt: { lt: expect.any(Date) },
    });
    const cutoff = (legacyQuery.where.createdAt.lt as Date).getTime();
    expect(Date.now() - cutoff).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 5_000);
    for (const q of [deadlineQuery, legacyQuery]) {
      expect(q.take).toBe(100);
      expect(q.orderBy).toEqual({ createdAt: 'asc' });
    }
  });

  it('releases each expired hold with the right reason and automatic audit action', async () => {
    const { service, holds } = makeCleanup({ deadline: ['guest_1'], legacy: ['old_1'] });
    await service.cleanupOrphanRegistrations();

    const expireCheck = { now: expect.any(Date), legacyCutoff: expect.any(Date) };
    expect(holds.releasePendingHold).toHaveBeenNthCalledWith(1, 'guest_1', {
      reason: 'Guest checkout hold expired',
      auditAction: 'REGISTRATION_AUTO_CANCELLED',
      inclusionMovement: 'expire',
      onlyIfExpired: expireCheck,
    });
    expect(holds.releasePendingHold).toHaveBeenNthCalledWith(2, 'old_1', {
      reason: 'Registration abandoned',
      auditAction: 'REGISTRATION_AUTO_CANCELLED',
      inclusionMovement: 'expire',
      onlyIfExpired: expireCheck,
    });
  });

  it('does nothing when there are no expired holds', async () => {
    const { service, holds } = makeCleanup();
    await service.cleanupOrphanRegistrations();
    expect(holds.releasePendingHold).not.toHaveBeenCalled();
  });

  it('keeps going when one release throws', async () => {
    const { service, holds } = makeCleanup({ deadline: ['a', 'b'] });
    holds.releasePendingHold.mockRejectedValueOnce(new Error('deadlock')).mockResolvedValueOnce({ released: true });

    await expect(service.cleanupOrphanRegistrations()).resolves.toBeUndefined();
    expect(holds.releasePendingHold).toHaveBeenCalledTimes(2);
  });

  it('stops at its time budget so a run cannot outlive the serverless limit', async () => {
    const { service, holds } = makeCleanup({ deadline: ['a', 'b', 'c'] });
    let clock = 1_000;
    const now = jest.spyOn(Date, 'now').mockImplementation(() => clock);
    // Each release "takes" 8 seconds, which is over the 7-second budget.
    holds.releasePendingHold.mockImplementation(async () => {
      clock += 8_000;
      return { released: true };
    });

    await service.cleanupOrphanRegistrations();
    now.mockRestore();

    expect(holds.releasePendingHold).toHaveBeenCalledTimes(1);
  });
});

describe('SchedulerService — autoCancelExpiredRegistrations() (early-bird sale ended)', () => {
  function makeEarlyBird(released: boolean) {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'reg_eb',
        tierId: 'tier_1',
        referenceNumber: 'AX-EB',
        attendees: [{ email: 'ana@example.com', firstName: 'Ana' }],
        event: { title: 'Sample Event', slug: 'sample-event' },
        tier: { id: 'tier_1', name: 'Early Bird' },
      },
    ]);
    const holds = { releasePendingHold: jest.fn().mockResolvedValue(released ? { released: true } : { released: false, why: 'has_proof' }) };
    const email = { sendCancellationEmail: jest.fn().mockResolvedValue(undefined) };
    const service = new SchedulerService(
      { registration: { findMany } } as any,
      email as any,
      {} as any,
      { get: jest.fn().mockReturnValue('https://axontickets.online') } as any,
      {} as any,
      undefined,
      {} as any,
      holds as any,
    );
    return { service, findMany, holds, email };
  }

  it('releases through the shared helper (capped, oldest first) and emails the lead attendee', async () => {
    const { service, findMany, holds, email } = makeEarlyBird(true);
    await service.autoCancelExpiredRegistrations();

    expect(findMany.mock.calls[0][0]).toEqual(expect.objectContaining({ take: 100, orderBy: { createdAt: 'asc' } }));
    expect(holds.releasePendingHold).toHaveBeenCalledWith('reg_eb', {
      reason: 'Sale period ended',
      auditAction: 'REGISTRATION_AUTO_CANCELLED',
      inclusionMovement: 'expire',
      metadata: { tierName: 'Early Bird' },
    });
    expect(email.sendCancellationEmail).toHaveBeenCalledTimes(1);
  });

  it('does not email anyone when the helper declined to release (for example a proof exists)', async () => {
    const { service, email } = makeEarlyBird(false);
    await service.autoCancelExpiredRegistrations();
    expect(email.sendCancellationEmail).not.toHaveBeenCalled();
  });
});

describe('SchedulerService — enforceAttendeeRetention()', () => {
  it('anonymizes only records selected past the two-year cutoff and deletes stored proofs', async () => {
    const oldCreatedAt = new Date('2023-01-01T00:00:00.000Z');
    const attendeeUpdate = jest.fn().mockResolvedValue(undefined);
    const proofDelete = jest.fn().mockResolvedValue({ count: 1 });
    const registrationUpdate = jest.fn().mockResolvedValue(undefined);
    const tx = {
      attendee: { update: attendeeUpdate },
      paymentProof: { deleteMany: proofDelete },
      registration: { update: registrationUpdate },
    };
    const prisma = {
      registration: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'reg_old',
            createdAt: oldCreatedAt,
            attendees: [{ id: 'attendee_old' }],
            proofs: [{ id: 'proof_old', cloudinaryPublicId: 'proofs/old' }],
          },
        ]),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const upload = { deleteStoredImage: jest.fn().mockResolvedValue(undefined) };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new SchedulerService(
      prisma as any,
      {} as any,
      audit as any,
      { get: jest.fn() } as any,
      upload as any,
    );

    await expect(service.enforceAttendeeRetention()).resolves.toEqual({
      anonymized: 1,
      proofsDeleted: 1,
    });
    expect(upload.deleteStoredImage).toHaveBeenCalledWith('proofs/old');
    expect(attendeeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'attendee_old' },
        data: expect.objectContaining({
          email: null,
          phone: null,
          deliveryAddress: expect.anything(),
          qrToken: null,
        }),
      }),
    );
    expect(proofDelete).toHaveBeenCalledWith({ where: { registrationId: 'reg_old' } });
    expect(registrationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'reg_old' },
        data: expect.objectContaining({
          guestEmail: null,
          guestResumeEmail: null,
          guestAccessTokenHash: null,
          notes: null,
        }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ATTENDEE_RETENTION_ENFORCED' }),
    );
  });

  it('selects a stale guest hold that has no attendees and no proofs by its unverified resume email', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new SchedulerService(
      { registration: { findMany } } as any,
      {} as any,
      {} as any,
      { get: jest.fn() } as any,
      {} as any,
    );

    await service.enforceAttendeeRetention();

    // A hold has zero attendees and zero proofs, so only the first (createdAt) branch
    // can ever match it: the resume email must be selected inside that branch.
    const createdAtBranch = findMany.mock.calls[0][0].where.OR[0];
    expect(createdAtBranch.createdAt).toEqual({ lt: expect.any(Date) });
    expect(createdAtBranch.OR).toContainEqual({ guestResumeEmail: { not: null } });
  });
});

describe('SchedulerService — sendWorkspaceDueReminders()', () => {
  it('consolidates Responsible and Accountable into one digest and records delivery only after success', async () => {
    const user = { id: 'user_1', email: 'owner@example.com', firstName: 'Ana', lastName: 'Reyes', isVerified: true };
    const item = {
      id: 'item_1', title: 'Confirm venue', status: 'open', dueDate: new Date('2026-08-19T00:00:00+08:00'),
      workspace: { event: { id: 'event_1', title: 'Leadership Summit' } },
      assignedToUser: user, accountableToUser: user, reminderDeliveries: [],
    };
    const prisma = {
      workspaceItem: { findMany: jest.fn().mockResolvedValue([item]) },
      workspaceReminderDelivery: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const email = { sendWorkspaceDueDigest: jest.fn().mockResolvedValue(true) };
    const service = new SchedulerService(
      prisma as any,
      email as any,
      { log: jest.fn() } as any,
      { get: jest.fn().mockReturnValue('https://uat.axontickets.online') } as any,
      { deleteStoredImage: jest.fn() } as any,
    );
    const result = await service.sendWorkspaceDueReminders(new Date('2026-08-18T20:00:00Z'));
    expect(result).toEqual({ recipients: 1, tasks: 1 });
    expect(email.sendWorkspaceDueDigest).toHaveBeenCalledTimes(1);
    expect(prisma.workspaceReminderDelivery.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
  });

  it('does not mark a delivery when SMTP is unavailable', async () => {
    const user = { id: 'user_1', email: 'owner@example.com', firstName: 'Ana', lastName: null, isVerified: true };
    const prisma = {
      workspaceItem: { findMany: jest.fn().mockResolvedValue([{
        id: 'item_1', title: 'Confirm venue', status: 'open', dueDate: new Date('2026-08-19T00:00:00+08:00'),
        workspace: { event: { id: 'event_1', title: 'Summit' } }, assignedToUser: user, accountableToUser: null, reminderDeliveries: [],
      }]) },
      workspaceReminderDelivery: { createMany: jest.fn() },
    };
    const service = new SchedulerService(
      prisma as any,
      { sendWorkspaceDueDigest: jest.fn().mockResolvedValue(false) } as any,
      { log: jest.fn() } as any,
      { get: jest.fn().mockReturnValue('https://uat.axontickets.online') } as any,
      { deleteStoredImage: jest.fn() } as any,
    );
    await expect(service.sendWorkspaceDueReminders(new Date('2026-08-18T20:00:00Z'))).resolves.toEqual({ recipients: 0, tasks: 0 });
    expect(prisma.workspaceReminderDelivery.createMany).not.toHaveBeenCalled();
  });
});
