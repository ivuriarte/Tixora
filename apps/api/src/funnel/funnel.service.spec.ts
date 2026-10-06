import { validate } from 'class-validator';
import { FunnelService } from './funnel.service';
import { FUNNEL_STEPS } from './funnel.constants';
import { CreateFunnelEventDto } from './dto/create-funnel-event.dto';

const NEW_STEPS = [
  'details_confirm_started',
  'details_confirm_succeeded',
  'details_confirm_failed',
  'order_not_owned_seen',
] as const;

function makeService() {
  const prisma = { registrationFunnelEvent: { create: jest.fn().mockResolvedValue({}) } };
  const service = new FunnelService(prisma as any);
  return { service, prisma };
}

describe('FunnelService checkout confirm-step events', () => {
  it.each(NEW_STEPS)('stores the %s step', async (step) => {
    const { service, prisma } = makeService();

    await service.track({ step, status: 'started', eventId: 'event-1', metadata: { mode: 'authenticated' } });

    expect(prisma.registrationFunnelEvent.create).toHaveBeenCalledTimes(1);
    expect(prisma.registrationFunnelEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ step, status: 'started', eventId: 'event-1' }),
    });
  });

  it('still ignores unknown steps at the service level', async () => {
    const { service, prisma } = makeService();

    await service.track({ step: 'not_a_real_step', status: 'started' });

    expect(prisma.registrationFunnelEvent.create).not.toHaveBeenCalled();
  });

  it('never throws when storing fails (tracking must not break checkout)', async () => {
    const { service, prisma } = makeService();
    prisma.registrationFunnelEvent.create.mockRejectedValue(new Error('db down'));

    await expect(
      service.track({ step: 'details_confirm_failed', status: 'failed', metadata: { mode: 'guest', httpStatus: 500, code: 'server' } }),
    ).resolves.toBeUndefined();
  });
});

describe('CreateFunnelEventDto step validation', () => {
  async function errorsFor(step: string) {
    const dto = Object.assign(new CreateFunnelEventDto(), { step, status: 'started' });
    return validate(dto);
  }

  it.each(NEW_STEPS)('accepts %s', async (step) => {
    expect(FUNNEL_STEPS).toContain(step);
    expect(await errorsFor(step)).toHaveLength(0);
  });

  it('rejects an unknown step', async () => {
    const errors = await errorsFor('not_a_real_step');
    expect(errors.some((e) => e.property === 'step')).toBe(true);
  });
});
