/**
 * U-29 – U-38: TicketsService unit tests
 *
 * Covers:
 *  U-29  findByUser — order tickets mapped correctly
 *  U-30  findByUser — attendee with qrToken → status 'valid'
 *  U-31  findByUser — attendee without qrToken → status 'pending_qr'
 *  U-32  findByUser — checked-in attendee → status 'used'
 *  U-33  findByUser — merge sorts newest event first
 *  U-34  findByUser — pagination slice + meta
 *  U-35  findOne — throws NotFoundException when ticket not found
 *  U-36  findOneAttendee — returns existing qrToken without DB write
 *  U-37  findOneAttendee — lazily generates + persists qrToken when null
 *  U-38  findOneAttendee — throws NotFoundException when attendee not found
 */
import { NotFoundException } from '@nestjs/common';
import { TicketsService } from './tickets.service';

// ── helpers ────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<{
  id: string;
  title: string;
  slug: string;
  startsAt: Date;
  venue: string;
  imageUrl: string | null;
}> = {}) {
  return {
    id: overrides.id ?? 'evt_1',
    title: overrides.title ?? 'Test Event',
    slug: overrides.slug ?? 'test-event',
    startsAt: overrides.startsAt ?? new Date('2026-06-01T10:00:00Z'),
    venue: overrides.venue ?? 'Manila',
    imageUrl: overrides.imageUrl ?? null,
  };
}

function makeAttendee(overrides: Partial<{
  id: string;
  firstName: string;
  lastName: string;
  qrToken: string | null;
  checkedInAt: Date | null;
  createdAt: Date;
  registration: {
    id: string;
    tierName: string | null;
    event: ReturnType<typeof makeEvent>;
    userId: string;
    status: string;
    currency?: string;
    lineItems?: Array<{
      id: string;
      kind: string;
      nameSnapshot: string;
      variantSnapshot: string | null;
      assignedAttendeeId: string | null;
      quantity: number;
      unitPrice: number;
      total: number;
      fulfillmentMethodSnapshot: string | null;
      fulfillmentInstructionsSnapshot: string | null;
      attendee: { firstName: string; lastName: string } | null;
      fulfillments: Array<{ status: string }>;
    }>;
  };
}> = {}) {
  const reg = overrides.registration ?? {
    id: 'reg_1',
    tierName: 'General',
    event: makeEvent(),
    userId: 'user_1',
    status: 'verified',
  };
  return {
    id: overrides.id ?? 'att_1',
    firstName: overrides.firstName ?? 'Alice',
    lastName: overrides.lastName ?? 'Smith',
    qrToken: overrides.qrToken !== undefined ? overrides.qrToken : 'existing-token',
    checkedInAt: overrides.checkedInAt !== undefined ? overrides.checkedInAt : null,
    createdAt: overrides.createdAt ?? new Date('2026-05-01T00:00:00Z'),
    registration: reg,
  };
}

function makeOrderTicket(overrides: Partial<{
  id: string;
  userId: string;
  qrCode: string;
  status: string;
  checkedInAt: Date | null;
  createdAt: Date;
  event: ReturnType<typeof makeEvent>;
  ticketTier: { name: string };
}> = {}) {
  return {
    id: overrides.id ?? 'tkt_1',
    userId: overrides.userId ?? 'user_1',
    qrCode: overrides.qrCode ?? 'qr-code-abc',
    status: overrides.status ?? 'valid',
    checkedInAt: overrides.checkedInAt !== undefined ? overrides.checkedInAt : null,
    createdAt: overrides.createdAt ?? new Date('2026-05-15T00:00:00Z'),
    event: overrides.event ?? makeEvent(),
    ticketTier: overrides.ticketTier ?? { name: 'VIP' },
  };
}

// ── mock factory ───────────────────────────────────────────────────────────

function buildMocks(
  orderTickets: ReturnType<typeof makeOrderTicket>[] = [],
  attendeeTickets: ReturnType<typeof makeAttendee>[] = [],
) {
  const prisma = {
    ticket: {
      findMany: jest.fn().mockResolvedValue(orderTickets),
      findFirst: jest.fn(),
    },
    attendee: {
      findMany: jest.fn().mockResolvedValue(attendeeTickets),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  } as any;

  const config = {
    get: jest.fn().mockReturnValue('test-hmac-secret-32chars-padding!!'),
  } as any;

  const service = new TicketsService(prisma, config);
  return { prisma, config, service };
}

// ── U-29: order tickets mapped correctly ──────────────────────────────────

describe('U-29: findByUser — order ticket fields', () => {
  it('maps order ticket fields correctly', async () => {
    const ticket = makeOrderTicket({ id: 'tkt_x', qrCode: 'qr-x', status: 'valid' });
    const { service } = buildMocks([ticket], []);
    const result = await service.findByUser('user_1');
    expect(result.data).toHaveLength(1);
    const item = result.data[0];
    expect(item.id).toBe('tkt_x');
    expect(item.source).toBe('order');
    expect(item.qrToken).toBe('qr-x');
    expect(item.status).toBe('valid');
  });
});

// ── U-30: attendee with qrToken → status 'valid' ──────────────────────────

describe('U-30: findByUser — attendee with qrToken → valid', () => {
  it("sets status 'valid' when qrToken is present and not checked in", async () => {
    const attendee = makeAttendee({ qrToken: 'tok', checkedInAt: null });
    const { service } = buildMocks([], [attendee]);
    const result = await service.findByUser('user_1');
    expect(result.data[0].status).toBe('valid');
  });
});

// ── U-31: attendee without qrToken → status 'pending_qr' ─────────────────

describe('U-31: findByUser — attendee without qrToken → pending_qr', () => {
  it("sets status 'pending_qr' when qrToken is null and not checked in", async () => {
    const attendee = makeAttendee({ qrToken: null, checkedInAt: null });
    const { service } = buildMocks([], [attendee]);
    const result = await service.findByUser('user_1');
    expect(result.data[0].status).toBe('pending_qr');
    expect(result.data[0].qrToken).toBe('');
  });
});

// ── U-32: checked-in attendee → status 'used' ─────────────────────────────

describe('U-32: findByUser — checked-in attendee → used', () => {
  it("sets status 'used' when checkedInAt is set regardless of qrToken", async () => {
    const attendee = makeAttendee({ qrToken: 'tok', checkedInAt: new Date() });
    const { service } = buildMocks([], [attendee]);
    const result = await service.findByUser('user_1');
    expect(result.data[0].status).toBe('used');
  });
});

// ── U-33: merge sorted newest event first ─────────────────────────────────

describe('U-33: findByUser — sort by eventStartsAt descending', () => {
  it('returns newest event first after merging order and registration tickets', async () => {
    const oldEvent = makeEvent({ id: 'evt_old', title: 'Old Event', startsAt: new Date('2025-01-01T00:00:00Z') });
    const newEvent = makeEvent({ id: 'evt_new', title: 'New Event', startsAt: new Date('2027-01-01T00:00:00Z') });

    const orderTicket = makeOrderTicket({ event: oldEvent });
    const attendee = makeAttendee({
      registration: { id: 'reg_2', tierName: 'GA', event: newEvent, userId: 'user_1', status: 'verified' },
    });

    const { service } = buildMocks([orderTicket], [attendee]);
    const result = await service.findByUser('user_1');

    expect(result.data[0].eventTitle).toBe('New Event');
    expect(result.data[1].eventTitle).toBe('Old Event');
  });
});

// ── U-34: pagination slice + meta ─────────────────────────────────────────

describe('U-34: findByUser — pagination', () => {
  it('returns correct page slice and meta', async () => {
    const tickets = Array.from({ length: 5 }, (_, i) =>
      makeOrderTicket({
        id: `tkt_${i}`,
        event: makeEvent({ startsAt: new Date(`2026-0${i + 1}-01T00:00:00Z`) }),
      }),
    );

    const { service } = buildMocks(tickets, []);
    const result = await service.findByUser('user_1', 2, 2);

    expect(result.data).toHaveLength(2);
    expect(result.meta.page).toBe(2);
    expect(result.meta.limit).toBe(2);
    expect(result.meta.total).toBe(5);
    expect(result.meta.totalPages).toBe(3);
    expect(result.meta.hasPrevPage).toBe(true);
    expect(result.meta.hasNextPage).toBe(true);
  });

  it('hasNextPage is false on the last page', async () => {
    const tickets = Array.from({ length: 3 }, (_, i) =>
      makeOrderTicket({ id: `tkt_${i}` }),
    );
    const { service } = buildMocks(tickets, []);
    const result = await service.findByUser('user_1', 1, 10);
    expect(result.meta.hasNextPage).toBe(false);
    expect(result.meta.hasPrevPage).toBe(false);
  });
});

describe('findByUser — attendee-specific optional inclusions', () => {
  it('counts only line items assigned to the ticket attendee', async () => {
    const attendee = makeAttendee({
      id: 'att_1',
      registration: {
        id: 'reg_1',
        tierName: 'General',
        event: makeEvent(),
        userId: 'user_1',
        status: 'verified',
        lineItems: [
          {
            id: 'line-own',
            kind: 'inclusion',
            nameSnapshot: 'Event shirt',
            variantSnapshot: 'Medium',
            assignedAttendeeId: 'att_1',
            quantity: 2,
            unitPrice: 500,
            total: 1000,
            fulfillmentMethodSnapshot: 'pickup',
            fulfillmentInstructionsSnapshot: 'Claim at the merchandise desk.',
            attendee: { firstName: 'Alice', lastName: 'Smith' },
            fulfillments: [{ status: 'pending' }],
          },
          {
            id: 'line-other',
            kind: 'inclusion',
            nameSnapshot: 'Workshop',
            variantSnapshot: 'Morning',
            assignedAttendeeId: 'att_2',
            quantity: 1,
            unitPrice: 300,
            total: 300,
            fulfillmentMethodSnapshot: 'manual',
            fulfillmentInstructionsSnapshot: null,
            attendee: { firstName: 'Bob', lastName: 'Smith' },
            fulfillments: [{ status: 'pending' }],
          },
          {
            id: 'line-unassigned',
            kind: 'inclusion',
            nameSnapshot: 'Unassigned item',
            variantSnapshot: null,
            assignedAttendeeId: null,
            quantity: 4,
            unitPrice: 100,
            total: 400,
            fulfillmentMethodSnapshot: 'manual',
            fulfillmentInstructionsSnapshot: null,
            attendee: null,
            fulfillments: [{ status: 'pending' }],
          },
        ],
      },
    });
    const { service } = buildMocks([], [attendee]);

    const result = await service.findByUser('user_1');

    expect(result.data[0]).toEqual(
      expect.objectContaining({ inclusionCount: 2, inclusionSubtotal: 1000 }),
    );
  });
});

// ── U-35: findOne — throws when not found ─────────────────────────────────

describe('U-35: findOne — NotFoundException', () => {
  it('throws NotFoundException when ticket does not exist', async () => {
    const { prisma, service } = buildMocks();
    prisma.ticket.findFirst.mockResolvedValue(null);
    await expect(service.findOne('tkt_missing', 'user_1')).rejects.toThrow(NotFoundException);
  });
});

// ── U-36: findOneAttendee — returns existing qrToken without DB write ─────

describe('U-36: findOneAttendee — existing qrToken, no DB write', () => {
  it('returns qrToken and does NOT call prisma.attendee.update', async () => {
    const attendee = makeAttendee({ qrToken: 'existing-tok', checkedInAt: null });
    const { prisma, service } = buildMocks();
    prisma.attendee.findFirst.mockResolvedValue(attendee);

    const result = await service.findOneAttendee('att_1', 'user_1');

    expect(result.qrToken).toBe('existing-tok');
    expect(prisma.attendee.update).not.toHaveBeenCalled();
  });

  it('maps source as registration and prefixes id with att_', async () => {
    const attendee = makeAttendee({ id: 'att_abc', qrToken: 'tok' });
    const { prisma, service } = buildMocks();
    prisma.attendee.findFirst.mockResolvedValue(attendee);

    const result = await service.findOneAttendee('att_abc', 'user_1');
    expect(result.id).toBe('att_att_abc');
    expect(result.source).toBe('registration');
  });

  it('returns only assigned add-ons with snapshotted fulfillment instructions', async () => {
    const attendee = makeAttendee({
      id: 'att_abc',
      qrToken: 'tok',
      registration: {
        id: 'reg_1',
        tierName: 'General',
        event: makeEvent(),
        userId: 'user_1',
        status: 'verified',
        currency: 'PHP',
        lineItems: [
          {
            id: 'line-own',
            kind: 'inclusion',
            nameSnapshot: 'Event shirt',
            variantSnapshot: 'Medium',
            assignedAttendeeId: 'att_abc',
            quantity: 1,
            unitPrice: 500,
            total: 500,
            fulfillmentMethodSnapshot: 'pickup',
            fulfillmentInstructionsSnapshot: 'Present this ticket at Booth 7.',
            attendee: { firstName: 'Alice', lastName: 'Smith' },
            fulfillments: [{ status: 'pending' }],
          },
          {
            id: 'line-other',
            kind: 'inclusion',
            nameSnapshot: 'Other attendee item',
            variantSnapshot: null,
            assignedAttendeeId: 'att_other',
            quantity: 1,
            unitPrice: 250,
            total: 250,
            fulfillmentMethodSnapshot: 'manual',
            fulfillmentInstructionsSnapshot: 'Ask the event host.',
            attendee: { firstName: 'Bob', lastName: 'Smith' },
            fulfillments: [{ status: 'pending' }],
          },
        ],
      },
    });
    const { prisma, service } = buildMocks();
    prisma.attendee.findFirst.mockResolvedValue(attendee);

    const result = await service.findOneAttendee('att_abc', 'user_1');

    expect(result.lineItems).toHaveLength(1);
    expect(result.lineItems[0]).toEqual(
      expect.objectContaining({
        id: 'line-own',
        fulfillmentInstructions: 'Present this ticket at Booth 7.',
      }),
    );
  });
});

// ── U-37: findOneAttendee — lazy qrToken generation ──────────────────────

describe('U-37: findOneAttendee — lazy qrToken generation', () => {
  it('generates and persists a qrToken when attendee.qrToken is null', async () => {
    const attendee = makeAttendee({ qrToken: null, checkedInAt: null });
    const { prisma, service } = buildMocks();
    prisma.attendee.findFirst.mockResolvedValue(attendee);
    prisma.attendee.update.mockResolvedValue({ ...attendee, qrToken: 'generated' });

    const result = await service.findOneAttendee('att_1', 'user_1');

    // A token was generated (non-empty, two dot-separated parts)
    expect(result.qrToken).toBeTruthy();
    expect(result.qrToken.split('.')).toHaveLength(2);

    // It was persisted to the database
    expect(prisma.attendee.update).toHaveBeenCalledWith({
      where: { id: attendee.id },
      data: { qrToken: result.qrToken },
    });
  });

  it('returns status valid (not pending_qr) after lazy generation', async () => {
    const attendee = makeAttendee({ qrToken: null, checkedInAt: null });
    const { prisma, service } = buildMocks();
    prisma.attendee.findFirst.mockResolvedValue(attendee);
    prisma.attendee.update.mockResolvedValue({});

    const result = await service.findOneAttendee('att_1', 'user_1');
    expect(result.status).toBe('valid');
  });
});

// ── U-38: findOneAttendee — throws when not found ─────────────────────────

describe('U-38: findOneAttendee — NotFoundException', () => {
  it('throws NotFoundException when attendee does not belong to user', async () => {
    const { prisma, service } = buildMocks();
    prisma.attendee.findFirst.mockResolvedValue(null);
    await expect(service.findOneAttendee('att_missing', 'user_1')).rejects.toThrow(NotFoundException);
  });
});
