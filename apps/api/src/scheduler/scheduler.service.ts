import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { AuditService } from '../audit/audit.service';
import { ConfigService } from '@nestjs/config';
import { UploadService } from '../upload/upload.service';
import { Prisma } from '@prisma/client';
import { manilaDateKey, workspaceDueState } from '../workspaces/workspaces.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly upload: UploadService,
  ) {}

  /**
   * P5-06 — Early bird auto-cancel.
   * Runs every hour. Cancels pending_payment registrations whose tier's sale period
   * has ended (tier.saleEndsAt < now). Sends a cancellation email to the lead attendee
   * and writes an audit log entry per registration.
   */
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
      this.config.get<string>('webUrl') ?? 'https://axontickets.online';

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
        if (lead?.email) {
          const reRegisterUrl = `${webBase}/events/${reg.event.slug}`;
          await this.emailService.sendCancellationEmail(
            lead.email ?? '',
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
   * Pending-payment reminder.
   * Runs every hour. Finds pending_payment registrations between 12 and 13 hours
   * old and sends a reminder email to the lead attendee. Capped at 200 per run to
   * stay within Vercel's 10s serverless limit.
   */
  async remindPendingRegistrations(): Promise<{ reminded: number }> {
    const now = Date.now();
    const twelveHoursAgo = new Date(now - 12 * 60 * 60 * 1000);
    const thirteenHoursAgo = new Date(now - 13 * 60 * 60 * 1000);

    const pending = await this.prisma.registration.findMany({
      where: {
        status: 'pending_payment',
        createdAt: { gte: thirteenHoursAgo, lte: twelveHoursAgo },
      },
      take: 200,
      include: {
        attendees: { where: { isLead: true }, take: 1 },
        event: { select: { title: true } },
      },
    });

    if (!pending.length) return { reminded: 0 };

    const webBase = this.config.get<string>('webUrl') ?? 'https://axontickets.online';
    let reminded = 0;

    for (const reg of pending) {
      const lead = reg.attendees[0];
      if (!lead?.email) continue;
      try {
        await this.emailService.sendPaymentReminderEmail(
          lead.email ?? '',
          lead.firstName,
          reg.referenceNumber,
          reg.event.title,
          `${webBase}/registrations/${reg.id}`,
        );
        reminded++;
      } catch (err: unknown) {
        this.logger.warn({
          msg: 'Payment reminder email failed',
          regId: reg.id,
          err: (err as Error).message,
        });
      }
    }

    this.logger.log({ msg: 'Payment reminders sent', reminded });
    return { reminded };
  }

  async sendWorkspaceDueReminders(now = new Date()): Promise<{ recipients: number; tasks: number }> {
    const todayKey = manilaDateKey(now);
    const soonLimit = new Date(now.getTime() + 4 * 86_400_000);
    const items = await this.prisma.workspaceItem.findMany({
      where: {
        dueDate: { not: null, lt: soonLimit },
        status: { notIn: ['done', 'not_applicable'] },
        workspace: {
          closedAt: null,
          event: {
            status: { notIn: ['cancelled', 'completed'] },
            OR: [{ organizationId: null }, { organization: { approvalStatus: 'approved' } }],
          },
        },
      },
      take: 500,
      orderBy: { dueDate: 'asc' },
      include: {
        workspace: { include: { event: { select: { id: true, title: true } } } },
        assignedToUser: { select: { id: true, email: true, firstName: true, lastName: true, isVerified: true } },
        accountableToUser: { select: { id: true, email: true, firstName: true, lastName: true, isVerified: true } },
        reminderDeliveries: { where: { reminderKey: { startsWith: `${todayKey}:` } }, select: { recipientUserId: true, reminderKey: true } },
      },
    });

    type DigestItem = {
      itemId: string;
      reminderKey: string;
      title: string;
      eventTitle: string;
      dueLabel: string;
      dueState: string;
      workspaceUrl: string;
    };
    const digests = new Map<string, { user: { id: string; email: string; name: string }; items: DigestItem[] }>();
    const webBase = this.config.get<string>('webUrl') ?? 'https://axontickets.online';

    for (const item of items) {
      const dueState = workspaceDueState(item.dueDate, item.status, now);
      if (!['overdue', 'due_today', 'due_soon'].includes(dueState)) continue;
      const reminderKey = `${todayKey}:${dueState}`;
      const dueKey = item.dueDate ? manilaDateKey(item.dueDate) : todayKey;
      const dayDistance = Math.round((Date.parse(`${dueKey}T00:00:00Z`) - Date.parse(`${todayKey}T00:00:00Z`)) / 86_400_000);
      const dueLabel = dueState === 'overdue'
        ? `${Math.abs(dayDistance)} day${Math.abs(dayDistance) === 1 ? '' : 's'} overdue`
        : dueState === 'due_today'
          ? 'Due today'
          : `Due in ${dayDistance} day${dayDistance === 1 ? '' : 's'}`;
      const recipients = [item.assignedToUser, item.accountableToUser]
        .filter((user): user is NonNullable<typeof user> => Boolean(user?.isVerified));
      for (const user of new Map(recipients.map((recipient) => [recipient.id, recipient])).values()) {
        if (item.reminderDeliveries.some((delivery) => delivery.recipientUserId === user.id && delivery.reminderKey === reminderKey)) continue;
        const digest = digests.get(user.id) ?? {
          user: {
            id: user.id,
            email: user.email,
            name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
          },
          items: [],
        };
        digest.items.push({
          itemId: item.id,
          reminderKey,
          title: item.title,
          eventTitle: item.workspace.event.title,
          dueLabel,
          dueState,
          workspaceUrl: `${webBase}/admin/events/${item.workspace.event.id}/workspace`,
        });
        digests.set(user.id, digest);
      }
    }

    let recipientCount = 0;
    let taskCount = 0;
    for (const digest of digests.values()) {
      const sent = await this.emailService.sendWorkspaceDueDigest(
        digest.user.email,
        digest.user.name,
        digest.items,
      );
      if (!sent) continue;
      await this.prisma.workspaceReminderDelivery.createMany({
        data: digest.items.map((item) => ({
          workspaceItemId: item.itemId,
          recipientUserId: digest.user.id,
          reminderKey: item.reminderKey,
        })),
        skipDuplicates: true,
      });
      recipientCount++;
      taskCount += digest.items.length;
    }
    this.logger.log({ msg: 'Workspace due reminders complete', recipients: recipientCount, tasks: taskCount, todayKey });
    return { recipients: recipientCount, tasks: taskCount };
  }

  /**
   * P5-07 — OTP cleanup.
   * Runs daily at 02:00. Deletes expired and used OtpCode records to keep
   * the table small and avoid leaking stale codes.
   */
  async cleanupExpiredOtpCodes(): Promise<void> {
    const now = new Date();
    const { count } = await this.prisma.otpCode.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: now } }, { used: true }],
      },
    });
    this.logger.log({ msg: 'OTP cleanup complete', deleted: count });
  }

  /**
   * CEO-approved attendee retention: two years from registration/attendee
   * creation. PII and payment-proof images are removed while non-identifying
   * financial and aggregate records remain available for reconciliation.
   */
  async enforceAttendeeRetention(): Promise<{ anonymized: number; proofsDeleted: number }> {
    const cutoff = new Date();
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 2);
    const registrations = await this.prisma.registration.findMany({
      where: {
        OR: [
          {
            createdAt: { lt: cutoff },
            OR: [
              { guestEmail: { not: null } },
              { guestAccessTokenHash: { not: null } },
              { notes: { not: null } },
            ],
          },
          {
            attendees: {
              some: {
                createdAt: { lt: cutoff },
                OR: [
                  { email: { not: null } },
                  { phone: { not: null } },
                  { bibNumber: { not: null } },
                  { deliveryAddress: { not: Prisma.JsonNull } },
                ],
              },
            },
          },
          { proofs: { some: { createdAt: { lt: cutoff } } } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: {
        attendees: {
          where: { createdAt: { lt: cutoff } },
          select: { id: true },
        },
        proofs: {
          where: { createdAt: { lt: cutoff } },
          select: { id: true, cloudinaryPublicId: true },
        },
      },
    });

    let anonymized = 0;
    let proofsDeleted = 0;
    for (const registration of registrations) {
      try {
        for (const proof of registration.proofs) {
          await this.upload.deleteStoredImage(proof.cloudinaryPublicId);
        }
        await this.prisma.$transaction(async (tx) => {
          for (const attendee of registration.attendees) {
            await tx.attendee.update({
              where: { id: attendee.id },
              data: {
                firstName: 'Deleted',
                lastName: `Attendee ${attendee.id.slice(0, 8)}`,
                email: null,
                phone: null,
                company: null,
                jobTitle: null,
                birthday: null,
                gender: null,
                genderIdentity: null,
                raceDivision: null,
                city: null,
                emergencyContactName: null,
                emergencyContactPhone: null,
                emergencyContactRelationship: null,
                claimMethod: null,
                deliveryAddress: Prisma.JsonNull,
                bibNumber: null,
                bibSequence: null,
                bibAssignedAt: null,
                qrToken: null,
                selectedSubEvents: Prisma.JsonNull,
              },
            });
          }
          await tx.paymentProof.deleteMany({
            where: { registrationId: registration.id },
          });
          if (registration.createdAt < cutoff) {
            await tx.registration.update({
              where: { id: registration.id },
              data: {
                guestEmail: null,
                guestAccessTokenHash: null,
                notes: null,
              },
            });
          }
        });
        proofsDeleted += registration.proofs.length;
        anonymized += registration.attendees.length;
        await this.audit.log({
          action: 'ATTENDEE_RETENTION_ENFORCED',
          entityType: 'Registration',
          entityId: registration.id,
          registrationId: registration.id,
          metadata: {
            cutoff: cutoff.toISOString(),
            attendeesAnonymized: registration.attendees.length,
            proofsDeleted: registration.proofs.length,
          },
        });
      } catch (error) {
        this.logger.error({
          msg: 'Attendee retention enforcement failed; record will be retried',
          registrationId: registration.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    this.logger.log({
      msg: 'Attendee retention enforcement complete',
      registrations: registrations.length,
      anonymized,
      proofsDeleted,
    });
    return { anonymized, proofsDeleted };
  }

  /**
   * Orphan registration cleanup.
   * Runs every hour. Cancels pending_payment registrations older than 2 hours
   * where the user abandoned the flow before uploading proof. Releases the
   * reserved seats back to the tier's soldQuantity so inventory stays accurate.
   */
  async cleanupOrphanRegistrations(): Promise<void> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const orphans = await this.prisma.registration.findMany({
      where: {
        status: 'pending_payment',
        createdAt: { lt: cutoff },
      },
      select: {
        id: true,
        tierId: true,
        attendeeCount: true,
      },
    });

    if (!orphans.length) return;

    this.logger.log({ msg: 'Orphan cleanup: found stale registrations', count: orphans.length });

    for (const reg of orphans) {
      try {
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

        this.logger.log({ msg: 'Orphan registration cancelled', id: reg.id });
      } catch (err: unknown) {
        this.logger.error({
          msg: 'Orphan cleanup failed for registration',
          id: reg.id,
          err: (err as Error).message,
        });
      }
    }
  }
}
