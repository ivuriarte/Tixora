import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminService } from './admin.service';
import { UpdateEventDto } from '../events/dto/event.dto';

const platformAdmin = { sub: 'platform-admin', isAdmin: true } as any;
const organizer = { sub: 'organizer-user', isAdmin: false } as any;

function build(overrides: { prisma?: Record<string, unknown> } = {}) {
  const prisma: any = {
    event: {
      findUnique: jest.fn().mockResolvedValue({ title: 'Midnight Matinee', isFree: false }),
      delete: jest.fn().mockReturnValue('event-delete-op'),
    },
    reservation: { deleteMany: jest.fn().mockReturnValue('reservation-delete-op') },
    checkoutQuote: { deleteMany: jest.fn().mockReturnValue('quote-delete-op') },
    platformConfig: { findUnique: jest.fn().mockResolvedValue({ value: '75' }) },
    organizationMember: { findFirst: jest.fn().mockResolvedValue({ organizationId: 'org-1' }) },
    $transaction: jest.fn().mockResolvedValue([{ count: 0 }, { count: 0 }, { id: 'event-1' }]),
    ...overrides.prisma,
  };
  const eventAccess = { assertEventMutationAccess: jest.fn().mockResolvedValue(undefined) };
  const eventsService = {
    create: jest.fn().mockResolvedValue({ id: 'event-1' }),
    update: jest.fn().mockResolvedValue({ id: 'event-1' }),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new AdminService(
    prisma,
    eventAccess as any,
    eventsService as any,
    {} as any,
    {} as any,
    { get: jest.fn() } as any,
    audit as any,
    {} as any,
  );
  return { service, prisma, eventsService, audit };
}

const platformOnly = { platformFee: 0, isFeatured: true, featuredOrder: 1, featuredUntil: '2026-12-31T00:00:00Z' };

describe('AdminService event safety', () => {
  describe('platform-only fields', () => {
    it('ignores service fee and featured fields from organizers on create', async () => {
      const { service, eventsService } = build();
      await service.createEvent({ title: 'Show', ...platformOnly } as any, organizer);
      const sent = eventsService.create.mock.calls[0][0];
      expect(sent).toEqual({ title: 'Show' });
    });

    it('keeps service fee and featured fields from platform admins on create', async () => {
      const { service, eventsService } = build();
      await service.createEvent({ title: 'Show', ...platformOnly } as any, platformAdmin);
      expect(eventsService.create.mock.calls[0][0]).toEqual({ title: 'Show', ...platformOnly });
    });

    it('ignores service fee and featured fields from organizers on update', async () => {
      const { service, eventsService } = build();
      await service.updateEvent('event-1', { title: 'Show', ...platformOnly } as any, organizer);
      expect(eventsService.update.mock.calls[0][1]).toEqual({ title: 'Show' });
    });

    it('applies the platform fee when an organizer switches a free event to paid', async () => {
      const { service, eventsService, prisma } = build();
      prisma.event.findUnique.mockResolvedValue({ isFree: true });
      await service.updateEvent('event-1', { isFree: false, platformFee: 0 } as any, organizer);
      expect(eventsService.update.mock.calls[0][1]).toEqual({ isFree: false, platformFee: 75 });
    });

    it('leaves an admin-set fee alone when an organizer saves an already-paid event', async () => {
      const { service, eventsService, prisma } = build();
      prisma.event.findUnique.mockResolvedValue({ isFree: false });
      await service.updateEvent('event-1', { isFree: false, platformFee: 50 } as any, organizer);
      expect(eventsService.update.mock.calls[0][1]).toEqual({ isFree: false });
    });

    it('keeps the fee an admin sends', async () => {
      const { service, eventsService } = build();
      await service.updateEvent('event-1', { isFree: false, platformFee: 0 } as any, platformAdmin);
      expect(eventsService.update.mock.calls[0][1]).toEqual({ isFree: false, platformFee: 0 });
    });
  });

  describe('event update audit', () => {
    it('records changed field names without values', async () => {
      const { service, audit } = build();
      await service.updateEvent(
        'event-1',
        { title: 'Show', paymentMethods: [{ type: 'bank', accountNumber: '1234567890' }], description: undefined } as any,
        organizer,
      );
      const entry = audit.log.mock.calls[0][0];
      expect(entry).toMatchObject({ action: 'EVENT_UPDATED', entityId: 'event-1', metadata: { fields: ['title', 'paymentMethods'] } });
      expect(JSON.stringify(entry)).not.toContain('1234567890');
    });
  });

  describe('deleteEvent', () => {
    it('deletes holds, unclaimed quotes and the event in one transaction, never registrations or orders', async () => {
      const { service, prisma, audit } = build();
      await expect(service.deleteEvent('event-1', organizer)).resolves.toEqual({ id: 'event-1' });
      expect(prisma.$transaction).toHaveBeenCalledWith(['reservation-delete-op', 'quote-delete-op', 'event-delete-op']);
      expect(prisma.checkoutQuote.deleteMany).toHaveBeenCalledWith({ where: { eventId: 'event-1', registrationId: null } });
      expect(prisma.registration).toBeUndefined();
      expect(prisma.order).toBeUndefined();
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'EVENT_DELETED', metadata: { title: 'Midnight Matinee' } }));
    });

    it('returns 409 and writes no audit row when registrations or orders block the delete', async () => {
      const fkError = new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
        code: 'P2003',
        clientVersion: 'test',
      });
      const { service, audit } = build({ prisma: { $transaction: jest.fn().mockRejectedValue(fkError) } });
      await expect(service.deleteEvent('event-1', organizer)).rejects.toBeInstanceOf(ConflictException);
      await expect(service.deleteEvent('event-1', organizer)).rejects.toThrow("can't be deleted. Cancel it instead.");
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('also treats a required-relation violation (P2014) as blocked', async () => {
      const relationError = new Prisma.PrismaClientKnownRequestError('Required relation violation', {
        code: 'P2014',
        clientVersion: 'test',
      });
      const { service } = build({ prisma: { $transaction: jest.fn().mockRejectedValue(relationError) } });
      await expect(service.deleteEvent('event-1', organizer)).rejects.toBeInstanceOf(ConflictException);
    });

    it('rethrows other database errors unchanged', async () => {
      const boom = new Error('connection reset');
      const { service } = build({ prisma: { $transaction: jest.fn().mockRejectedValue(boom) } });
      await expect(service.deleteEvent('event-1', organizer)).rejects.toBe(boom);
    });

    it('returns 404 for a missing event', async () => {
      const { service, prisma } = build();
      prisma.event.findUnique.mockResolvedValue(null);
      await expect(service.deleteEvent('missing', organizer)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('UpdateEventDto.status', () => {
    it.each(['draft', 'on_sale', 'sold_out', 'cancelled'])('accepts %s', async (status) => {
      const errors = await validate(plainToInstance(UpdateEventDto, { status }));
      expect(errors).toHaveLength(0);
    });

    it.each(['completed', 'published', 'anything'])('rejects %s', async (status) => {
      const errors = await validate(plainToInstance(UpdateEventDto, { status }));
      expect(errors.map((error) => error.property)).toContain('status');
    });
  });
});
