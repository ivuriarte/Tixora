import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { AuditService } from '../audit/audit.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  /**
   * P5-06 — Early bird auto-cancel.
   * Runs every hour. Cancels pending_payment registrations whose tier's sale period
   * has ended (tier.saleEndsAt < now). Sends a cancellation email to the lead attendee
   * and writes an audit log entry per registration.
   */
  @Cron('0 * * * *')
  async autoCancelExpiredRegistrations(): Promise<void> {
    const now = new Date();

    const expired = await this.prisma.registration.findMany({
      where: {
        status: 'pending_payment',
        tier: { saleEndsAt: { lt: now } },
      },
      include: {
        attendees: { where: { isLead: true }, take: 1 },
        event: { select: { title: true, slug: true } },
        tier: { select: { id: true, name: true } },
      },
    });

    if (!expired.length) return;

    this.logger.log({ msg: 'Auto-cancel: found expired registrations', count: expired.length });

    const webBase =
      this.config.get<string>('webUrl') ?? 'https://axon-tickets-app.vercel.app';

    for (const reg of expired) {
      try {
        // Cancel the registration and release the seat.
        await this.prisma.$transaction([
          this.prisma.registration.update({
            where: { id: reg.id },
            data: { status: 'cancelled' },
          }),
          ...(reg.tierId
            ? [
                this.prisma.ticketTier.update({
                  where: { id: reg.tierId },
                  data: { soldQuantity: { decrement: reg.attendeeCount } },
                }),
              ]
            : []),
        ]);

        await this.audit.log({
          action: 'REGISTRATION_AUTO_CANCELLED',
          entityType: 'Registration',
          entityId: reg.id,
          registrationId: reg.id,
          metadata: { reason: 'Sale period ended', tierName: reg.tier?.name ?? null },
        });

        const lead = reg.attendees[0];
        if (lead) {
          const reRegisterUrl = `${webBase}/events/${reg.event.slug}`;
          await this.emailService.sendCancellationEmail(
            lead.email,
            lead.firstName,
            reg.referenceNumber,
            reg.event.title,
            'The sale period for your selected ticket tier has ended.',
            reRegisterUrl,
          );
        }

        this.logger.log({ msg: 'Auto-cancelled registration', id: reg.id });
      } catch (err: unknown) {
        this.logger.error({
          msg: 'Auto-cancel failed for registration',
          id: reg.id,
          err: (err as Error).message,
        });
      }
    }
  }

  /**
   * P5-07 — OTP cleanup.
   * Runs daily at 02:00. Deletes expired and used OtpCode records to keep
   * the table small and avoid leaking stale codes.
   */
  @Cron('0 2 * * *')
  async cleanupExpiredOtpCodes(): Promise<void> {
    const now = new Date();
    const { count } = await this.prisma.otpCode.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: now } }, { used: true }],
      },
    });
    this.logger.log({ msg: 'OTP cleanup complete', deleted: count });
  }
}
