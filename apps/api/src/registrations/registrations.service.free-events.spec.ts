import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RegistrationsService } from './registrations.service';

// Minimal DTO for a single attendee
const attendeeDto = {
  firstName: 'Ana',
  lastName: 'Reyes',
  email: 'ana@example.com',
  phone: '09171234567',
  birthday: '1995-06-15',
  gender: 'female',
  city: 'Davao City',
  company: '',
  jobTitle: '',
};

const baseCreateDto = {
  eventId: 'evt_1',
  tierId: 'tier_1',
  attendees: [attendeeDto],
};

// Builds a minimal RegistrationsService with all dependencies mocked.
// `txRegistrationCreate` is what gets returned from tx.registration.create.
function makeService(opts: {
  tierPrice?: number;
  platformFee?: number;
  isFree?: boolean;
  allowManualPayment?: boolean;
  txRegistrationCreate?: object;
} = {}) {
  const {
    tierPrice = 0,
    platformFee = 0,
    isFree = false,
    allowManualPayment = false,
    txRegistrationCreate,
  } = opts;

  const createdReg = txRegistrationCreate ?? {
    id: 'reg_1',
    referenceNumber: 'AX-0001',
    status: tierPrice === 0 && platformFee === 0 ? 'pending_approval' : 'pending_payment',
    total: new Prisma.Decimal(0),
    fees: new Prisma.Decimal(0),
    subtotal: new Prisma.Decimal(0),
    discount: new Prisma.Decimal(0),
    unitPrice: new Prisma.Decimal(0),
    attendeeCount: 1,
    currency: 'PHP',
    notes: null,
    rejectionReason: null,
    referralCodeSnapshot: null,
    eventId: 'evt_1',
    tierId: 'tier_1',
    tierName: 'General',
    createdAt: new Date(),
    updatedAt: new Date(),
    attendees: [{ id: 'att_1', isLead: true, email: 'ana@example.com', firstName: 'Ana', qrToken: null }],
    event: { title: 'Free Fest', bankName: null, bankAccountNumber: null, bankAccountName: null, paymentMethods: [], gcashNumber: null },
  };

  const mockTx = {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([{ sold_quantity: 0, total_quantity: 100 }]),
    registration: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(createdReg),
      aggregate: jest.fn().mockResolvedValue({ _sum: { attendeeCount: 0 } }),
    },
    ticket: { count: jest.fn().mockResolvedValue(0) },
    ticketTier: { update: jest.fn().mockResolvedValue({}) },
    referralCode: { findFirst: jest.fn().mockResolvedValue(null) },
    referralCodeUsage: { count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue({}) },
    user: { update: jest.fn().mockResolvedValue({}) },
  };

  const mockEvent = {
    id: 'evt_1',
    title: 'Free Fest',
    status: 'published',
    isFree,
    allowManualPayment,
    platformFee: new Prisma.Decimal(platformFee),
    maxPerUser: 0,
    maxCapacity: null,
    bankName: null,
    bankAccountNumber: null,
    bankAccountName: null,
    paymentMethods: [],
    tiers: [{
      id: 'tier_1',
      name: 'General',
      price: new Prisma.Decimal(tierPrice),
      availableQuantity: 100,
      maxPerOrder: 10,
      currency: 'PHP',
    }],
  };

  const mockPrisma = {
    event: { findUnique: jest.fn().mockResolvedValue(mockEvent) },
    $transaction: jest.fn().mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
    referralCodeUsage: { count: jest.fn().mockResolvedValue(0) },
    registration: { findUnique: jest.fn(), update: jest.fn() },
    paymentProof: { update: jest.fn() },
    attendee: { update: jest.fn() },
  };

  const mockEmail = {
    sendFreeRegistrationConfirmation: jest.fn().mockResolvedValue(undefined),
    sendRegistrationConfirmation: jest.fn().mockResolvedValue(undefined),
    sendQrCodeEmail: jest.fn().mockResolvedValue(undefined),
  };
  const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };
  const mockConfig = { get: jest.fn().mockReturnValue('https://axontickets.online') };
  const mockFunnel = { track: jest.fn().mockResolvedValue(undefined) };

  const service = new RegistrationsService(
    mockPrisma as any,
    mockEmail as any,
    mockAudit as any,
    mockConfig as any,
    mockFunnel as any,
  );

  return { service, mockTx, mockPrisma, mockEmail };
}

// Builds a mock reg for approve() / reject() tests
function mockRegForApprove(opts: { total: number; proofs?: object[] } = { total: 0 }) {
  return {
    id: 'reg_1',
    status: opts.total === 0 ? 'pending_approval' : 'proof_submitted',
    total: new Prisma.Decimal(opts.total),
    referenceNumber: 'AX-0001',
    notes: null,
    rejectionReason: null,
    currency: 'PHP',
    attendeeCount: 1,
    createdAt: new Date(),
    proofs: opts.proofs ?? [],
    attendees: [{ id: 'att_1', isLead: true, email: 'ana@example.com', firstName: 'Ana', qrToken: null }],
    event: { id: 'evt_1', title: 'Free Fest', startsAt: new Date(), venue: 'Hall A', maxCapacity: null },
    user: { id: 'user_1', email: 'ana@example.com', firstName: 'Ana', lastName: 'Reyes' },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// createImpl — isFreeEvent branch
// ─────────────────────────────────────────────────────────────────────────────

describe('RegistrationsService — free-event creation', () => {
  it('sets status to pending_approval when tier price and platform fee are both 0', async () => {
    const { service, mockTx } = makeService({ tierPrice: 0, platformFee: 0 });

    await (service as any).createImpl(baseCreateDto, 'user_1', '127.0.0.1');

    const createCall = mockTx.registration.create.mock.calls[0][0];
    expect(createCall.data.status).toBe('pending_approval');
  });

  it('sets status to pending_payment when tier has a price', async () => {
    const { service, mockTx } = makeService({ tierPrice: 500, platformFee: 50, allowManualPayment: true });

    await (service as any).createImpl(baseCreateDto, 'user_1', '127.0.0.1');

    const createCall = mockTx.registration.create.mock.calls[0][0];
    expect(createCall.data.status).toBe('pending_payment');
  });

  it('sets fees to 0 for a free event', async () => {
    const { service, mockTx } = makeService({ tierPrice: 0, platformFee: 0 });

    await (service as any).createImpl(baseCreateDto, 'user_1', '127.0.0.1');

    const createCall = mockTx.registration.create.mock.calls[0][0];
    expect(createCall.data.fees).toBe(0);
  });

  it('uses explicit isFree to suppress stale tier price and platform fee', async () => {
    const { service, mockTx } = makeService({ tierPrice: 500, platformFee: 50, isFree: true, allowManualPayment: false });

    await (service as any).createImpl(baseCreateDto, 'user_1', '127.0.0.1');

    const createCall = mockTx.registration.create.mock.calls[0][0];
    expect(createCall.data.unitPrice).toBe(0);
    expect(createCall.data.subtotal).toBe(0);
    expect(createCall.data.fees).toBe(0);
    expect(createCall.data.total).toBe(0);
    expect(createCall.data.status).toBe('pending_approval');
  });

  it('allows creation of free event without allowManualPayment', async () => {
    const { service } = makeService({ tierPrice: 0, platformFee: 0, allowManualPayment: false });

    await expect((service as any).createImpl(baseCreateDto, 'user_1')).resolves.not.toThrow();
  });

  it('throws BadRequestException for paid event when allowManualPayment is false', async () => {
    const { service } = makeService({ tierPrice: 500, platformFee: 50, allowManualPayment: false });

    await expect((service as any).createImpl(baseCreateDto, 'user_1'))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('calls sendFreeRegistrationConfirmation (not sendRegistrationConfirmation) for free event', async () => {
    const { service, mockEmail } = makeService({ tierPrice: 0, platformFee: 0 });

    await (service as any).createImpl(baseCreateDto, 'user_1');

    expect(mockEmail.sendFreeRegistrationConfirmation).toHaveBeenCalledTimes(1);
    expect(mockEmail.sendRegistrationConfirmation).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// approve() — free vs paid proof guard
// ─────────────────────────────────────────────────────────────────────────────

describe('RegistrationsService — approve()', () => {
  function makeApproveService(reg: object) {
    const mockPrisma = {
      registration: {
        findUnique: jest.fn().mockResolvedValue(reg),
        update: jest.fn().mockResolvedValue({}),
      },
      paymentProof: { update: jest.fn().mockResolvedValue({}) },
      attendee: { update: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };
    const mockConfig = { get: jest.fn().mockReturnValue('') };
    const mockEmail = { sendQrCodeEmail: jest.fn().mockResolvedValue(undefined) };
    const mockFunnel = { track: jest.fn().mockResolvedValue(undefined) };

    const service = new RegistrationsService(
      mockPrisma as any,
      mockEmail as any,
      mockAudit as any,
      mockConfig as any,
      mockFunnel as any,
    );
    return { service, mockPrisma };
  }

  it('approves a free registration (pending_approval) that has no payment proof', async () => {
    const reg = mockRegForApprove({ total: 0, proofs: [] });
    const { service } = makeApproveService(reg);

    await expect(service.approve('reg_1', 'admin_1')).resolves.not.toThrow();
  });

  it('throws BadRequestException when a paid registration has no proof', async () => {
    const reg = mockRegForApprove({ total: 500, proofs: [] });
    const { service } = makeApproveService(reg);

    await expect(service.approve('reg_1', 'admin_1'))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('approves a paid registration that has a proof', async () => {
    const reg = mockRegForApprove({
      total: 500,
      proofs: [{ id: 'proof_1', status: 'pending', imageUrl: 'https://cdn.example.com/proof.jpg' }],
    });
    const { service } = makeApproveService(reg);

    await expect(service.approve('reg_1', 'admin_1')).resolves.not.toThrow();
  });

  it('throws NotFoundException when registration does not exist', async () => {
    const mockPrisma = { registration: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new RegistrationsService(mockPrisma as any, {} as any, {} as any, {} as any, {} as any);

    await expect(service.approve('missing', 'admin_1'))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws BadRequestException when status is not approvable', async () => {
    const reg = { ...mockRegForApprove({ total: 0 }), status: 'verified' };
    const { service } = makeApproveService(reg);

    await expect(service.approve('reg_1', 'admin_1'))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});
