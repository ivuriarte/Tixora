import { NotFoundException } from '@nestjs/common';
import { RegistrationsService } from './registrations.service';

/**
 * The checkout dead end (a real incident): a logged-in visitor asked for a guest order. The API must
 * answer 404 (never 403, so ids cannot be probed) and must never write anything. The web relies on
 * the status code, so these are regression tests for the "not yours" answer.
 *
 * The prisma mock mirrors the real filter (a row matches only when BOTH id and userId are equal;
 * null = guest order) and THROWS when the userId filter is missing, so a refactor that drops the
 * ownership filter fails these tests instead of passing by accident.
 */
type Row = {
  id: string;
  userId: string | null;
  status?: string;
  attendeeCount?: number;
  attendees?: unknown[];
  event?: unknown;
};

function makeService(rows: Row[]) {
  const prisma = {
    registration: {
      findFirst: jest.fn(async ({ where }: { where: { id: string; userId?: string | null } }) => {
        if (where.userId === undefined) throw new Error('ownership filter missing: userId must be part of the lookup');
        return rows.find((r) => r.id === where.id && r.userId === where.userId) ?? null;
      }),
      update: jest.fn(),
    },
    attendee: { createMany: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new RegistrationsService(
    prisma as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
  return { service, prisma };
}

const dto = { attendees: [{ firstName: 'Ana', lastName: 'Cruz', email: 'ana@example.com' }] } as any;

/** Runs the call and returns whatever it threw (or null), so we can tell "404" from "got past the lookup". */
async function errorOf(call: () => Promise<unknown>): Promise<unknown> {
  try {
    await call();
    return null;
  } catch (error) {
    return error;
  }
}

describe('RegistrationsService ownership answers (404, never 403)', () => {
  const guestOrder: Row = { id: 'guest-order', userId: null };
  const otherUsersOrder: Row = { id: 'other-order', userId: 'user-2' };
  const ownOrder: Row = {
    id: 'own-order',
    userId: 'user-1',
    status: 'proof_submitted',
    attendeeCount: 1,
    attendees: [],
    event: { id: 'event-1', title: 'QA', slug: 'qa', eventType: 'standard', runningConfig: null, startsAt: new Date('2027-01-01') },
  };

  describe('findById', () => {
    it('answers 404 for a guest-owned order read by a logged-in user, and looks it up by id AND userId', async () => {
      const { service, prisma } = makeService([guestOrder, ownOrder]);

      await expect(service.findById('guest-order', 'user-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.registration.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'guest-order', userId: 'user-1' } }),
      );
    });

    it("answers 404 for another user's order, and looks it up by id AND userId", async () => {
      const { service, prisma } = makeService([otherUsersOrder, ownOrder]);

      await expect(service.findById('other-order', 'user-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.registration.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'other-order', userId: 'user-1' } }),
      );
    });

    it('positive control: the owner gets past the lookup (no 404)', async () => {
      const { service, prisma } = makeService([ownOrder]);

      const error = await errorOf(() => service.findById('own-order', 'user-1'));

      expect(error).not.toBeInstanceOf(NotFoundException);
      expect(prisma.registration.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'own-order', userId: 'user-1' } }),
      );
    });
  });

  describe('updateAttendees', () => {
    it('answers 404 for a guest-owned order, looks it up by id AND userId, and writes nothing', async () => {
      const { service, prisma } = makeService([guestOrder, ownOrder]);

      await expect(service.updateAttendees('guest-order', 'user-1', dto)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.registration.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'guest-order', userId: 'user-1' } }),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.attendee.createMany).not.toHaveBeenCalled();
      expect(prisma.registration.update).not.toHaveBeenCalled();
    });

    it("answers 404 for another user's order, looks it up by id AND userId, and writes nothing", async () => {
      const { service, prisma } = makeService([otherUsersOrder, ownOrder]);

      await expect(service.updateAttendees('other-order', 'user-1', dto)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.registration.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'other-order', userId: 'user-1' } }),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.registration.update).not.toHaveBeenCalled();
    });

    it('positive control: the owner gets past the lookup (no 404) and the save is attempted', async () => {
      const { service, prisma } = makeService([ownOrder]);

      const error = await errorOf(() => service.updateAttendees('own-order', 'user-1', dto));

      expect(error).not.toBeInstanceOf(NotFoundException);
      expect(prisma.registration.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'own-order', userId: 'user-1' } }),
      );
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
