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

  const service = new SchedulerService(
    mockPrisma as any,
    mockEmail as any,
    mockAudit as any,
    mockConfig as any,
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
