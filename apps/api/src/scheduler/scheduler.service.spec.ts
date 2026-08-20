import { SchedulerService } from './scheduler.service';

function makeScheduler(pendingRegs: object[] = []) {
  const mockPrisma = {
    registration: {
      findMany: jest.fn().mockResolvedValue(pendingRegs),
    },
  };
  const mockEmail = {
    sendPaymentReminderEmail: jest.fn().mockResolvedValue(undefined),
  };
  const mockAudit = { log: jest.fn() };
  const mockConfig = { get: jest.fn().mockReturnValue('https://axontickets.online') };
  const mockUpload = { deleteStoredImage: jest.fn().mockResolvedValue(undefined) };

  const service = new SchedulerService(
    mockPrisma as any,
    mockEmail as any,
    mockAudit as any,
    mockConfig as any,
    mockUpload as any,
  );
  return { service, mockPrisma, mockEmail };
}

function pendingReg(id: string, email: string, firstName: string) {
  return {
    id,
    referenceNumber: `AX-${id}`,
    attendees: [{ id: `att_${id}`, isLead: true, email, firstName }],
    event: { title: 'Sample Event' },
  };
}

describe('SchedulerService — remindPendingRegistrations()', () => {
  it('returns { reminded: 0 } when no qualifying registrations exist', async () => {
    const { service } = makeScheduler([]);

    await expect(service.remindPendingRegistrations()).resolves.toEqual({ reminded: 0 });
  });

  it('sends a reminder email for each registration with a lead attendee', async () => {
    const regs = [
      pendingReg('reg_1', 'ana@example.com', 'Ana'),
      pendingReg('reg_2', 'ben@example.com', 'Ben'),
    ];
    const { service, mockEmail } = makeScheduler(regs);

    const result = await service.remindPendingRegistrations();

    expect(result).toEqual({ reminded: 2 });
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
    const { service, mockEmail } = makeScheduler([regWithNoLead]);

    const result = await service.remindPendingRegistrations();

    expect(result).toEqual({ reminded: 0 });
    expect(mockEmail.sendPaymentReminderEmail).not.toHaveBeenCalled();
  });

  it('continues processing remaining registrations when one email fails', async () => {
    const regs = [
      pendingReg('reg_1', 'ana@example.com', 'Ana'),
      pendingReg('reg_2', 'ben@example.com', 'Ben'),
    ];
    const { service, mockEmail } = makeScheduler(regs);

    mockEmail.sendPaymentReminderEmail
      .mockRejectedValueOnce(new Error('SMTP timeout'))
      .mockResolvedValueOnce(undefined);

    const result = await service.remindPendingRegistrations();

    expect(result).toEqual({ reminded: 1 });
    expect(mockEmail.sendPaymentReminderEmail).toHaveBeenCalledTimes(2);
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
        data: expect.objectContaining({ guestEmail: null, guestAccessTokenHash: null, notes: null }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ATTENDEE_RETENTION_ENFORCED' }),
    );
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
