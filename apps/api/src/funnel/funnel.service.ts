import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FunnelStatus, FunnelStep, FUNNEL_STATUSES, FUNNEL_STEPS } from './funnel.constants';

interface FunnelContext {
  userAgent?: string;
  referrer?: string;
}

interface TrackFunnelInput {
  eventId?: string | null;
  sessionId?: string | null;
  userId?: string | null;
  email?: string | null;
  step: string;
  status: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class FunnelService {
  private readonly logger = new Logger(FunnelService.name);

  constructor(private readonly prisma: PrismaService) {}

  async track(input: TrackFunnelInput, context?: FunnelContext) {
    if (!FUNNEL_STEPS.includes(input.step as FunnelStep)) {
      this.logger.warn({ msg: 'Ignored unknown funnel step', step: input.step });
      return;
    }
    if (!FUNNEL_STATUSES.includes(input.status as FunnelStatus)) {
      this.logger.warn({ msg: 'Ignored unknown funnel status', status: input.status, step: input.step });
      return;
    }

    try {
      await this.prisma.registrationFunnelEvent.create({
        data: {
          eventId: input.eventId ?? null,
          sessionId: input.sessionId ?? null,
          userId: input.userId ?? null,
          email: input.email?.trim().toLowerCase() ?? null,
          step: input.step,
          status: input.status,
          metadata: (input.metadata as Prisma.InputJsonValue | undefined) ?? undefined,
          userAgent: context?.userAgent ?? null,
          referrer: context?.referrer ?? null,
        },
      });
    } catch (error) {
      this.logger.warn({
        msg: 'Failed to persist funnel event',
        step: input.step,
        status: input.status,
        err: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
