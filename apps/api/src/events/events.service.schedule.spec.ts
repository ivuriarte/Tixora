import { BadRequestException } from '@nestjs/common';
import { EventsService } from './events.service';

describe('EventsService schedule validation', () => {
  const service = new EventsService({} as any, {} as any, {} as any);
  const validate = (start: Date, end: Date | null, saved?: Date) =>
    (service as any).validateSchedule(start, end, saved);
  const hours = (n: number) => new Date(Date.now() + n * 3_600_000);

  it('accepts a future start with no end', () => {
    expect(() => validate(hours(24), null)).not.toThrow();
  });

  it('rejects a past start on a new event', () => {
    expect(() => validate(hours(-24), null)).toThrow(BadRequestException);
  });

  it('allows a start a moment ago (clock skew)', () => {
    expect(() => validate(new Date(Date.now() - 60_000), null)).not.toThrow();
  });

  it('keeps past events editable when the start is unchanged', () => {
    const saved = hours(-24);
    expect(() => validate(new Date(saved.getTime()), null, saved)).not.toThrow();
  });

  it('rejects moving an existing event to a different past start', () => {
    expect(() => validate(hours(-48), null, hours(-24))).toThrow(BadRequestException);
  });

  it('rejects an end at or before the start', () => {
    const start = hours(24);
    expect(() => validate(start, start)).toThrow(BadRequestException);
    expect(() => validate(start, hours(23))).toThrow(BadRequestException);
  });

  it('allows adding an end time to a past event', () => {
    const saved = hours(-24);
    expect(() => validate(saved, hours(-20), saved)).not.toThrow();
  });

  describe('update', () => {
    const pastStart = hours(-24);
    const existing = {
      id: 'event-1',
      eventType: 'standard',
      runningConfig: null,
      status: 'sold_out',
      isFree: true,
      imageUrl: 'https://example.com/cover.jpg',
      startsAt: pastStart,
      endsAt: null as Date | null,
    };
    const serviceWith = (event: typeof existing) => {
      const prisma = {
        event: {
          findUnique: jest.fn().mockResolvedValue(event),
          update: jest.fn().mockResolvedValue(event),
        },
      };
      return { svc: new EventsService(prisma as any, {} as any, {} as any), prisma };
    };

    it('lets a legacy event without an end time be saved unchanged', async () => {
      const { svc, prisma } = serviceWith(existing);
      await svc.update('event-1', { startsAt: pastStart.toISOString(), endsAt: null } as any);
      expect(prisma.event.update).toHaveBeenCalled();
    });

    it('rejects removing an end time that is already set', async () => {
      const { svc, prisma } = serviceWith({ ...existing, endsAt: hours(-20) });
      await expect(
        svc.update('event-1', { startsAt: pastStart.toISOString(), endsAt: null } as any),
      ).rejects.toThrow('Event end date and time cannot be removed.');
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it('rejects moving an event start into the past', async () => {
      const { svc } = serviceWith({ ...existing, startsAt: hours(24) });
      await expect(
        svc.update('event-1', { startsAt: hours(-1).toISOString() } as any),
      ).rejects.toThrow('Event start date and time cannot be in the past.');
    });
  });
});
