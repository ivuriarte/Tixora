import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { AuditService } from '../audit/audit.service';
import { ConfigService } from '@nestjs/config';
import { UploadService } from '../upload/upload.service';
import { manilaDateKey, workspaceDueState } from '../workspaces/workspaces.service';
import { OptionalInclusionsService } from '../optional-inclusions/optional-inclusions.service';
import { GuestHoldService } from '../registrations/guest-hold.service';
import { RegistrationHoldService } from '../registrations/registration-hold.service';

/** Max rows a cleanup run handles, and how long it may run (Vercel's limit is 10 s). */
const CLEANUP_BATCH = 100;
const CLEANUP_BUDGET_MS = 7_000;
const LEGACY_HOLD_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly upload: UploadService,
    @Optional() private readonly optionalInclusions?: OptionalInclusionsService,
    // Trailing and TS-optional so specs that build the service by hand keep compiling;
    // Nest still injects both (GuestHoldModule).
    private readonly guestHold?: GuestHoldService,
    private readonly holds?: RegistrationHoldService,
  ) {}

  private requireHolds(): RegistrationHoldService {
    if (!this.holds) throw new Error('RegistrationHoldService is not configured');
    return this.holds;
  }

  private requireGuestHold(): GuestHoldService {
    if (!this.guestHold) throw new Error('GuestHoldService is not configured');
    return this.guestHold;
  }

  /**
   * P5-06 — Early bird auto-cancel.
   * Cancels pending_payment registrations whose tier's sale period has ended
   * (tier.saleEndsAt < now) through the shared release helper, sends a cancellation
   * email to the lead attendee, and writes an audit log entry per registration.
   * Capped and time-budgeted like the hold cleanup; rows are independent, so a
   * partial run is safe and the next run continues.
   */
  async autoCancelExpiredRegistrations(): Promise<void> {
    const now = new Date();
    const startedAt = Date.now();

    const expired = await this.prisma.registration.findMany({
      where: {
        status: 'pending_payment',
        tier: { saleEndsAt: { lt: now } },
      },
      orderBy: { createdAt: 'asc' },
      take: CLEANUP_BATCH,
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
      if (Date.now() - startedAt > CLEANUP_BUDGET_MS) {
        this.logger.warn({ msg: 'Auto-cancel stopped at its time budget; the next run continues' });
        break;
      }
      try {
        const result = await this.requireHolds().releasePendingHold(reg.id, {
          reason: 'Sale period ended',
          auditAction: 'REGISTRATION_AUTO_CANCELLED',
          inclusionMovement: 'expire',
          metadata: { tierName: reg.tier?.name ?? null },
        });
        if (!result.released) continue;

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
   * Pending-payment reminder, sent ONCE per registration.
   *
   * The cron workflow calls this every 5 minutes but each send window is an hour wide,
   * so a Redis marker (set before sending, removed if the send fails) is what makes it
   * once-only. If Redis is unavailable the reminder is skipped, never duplicated.
   *
   * - Registrations with a lead attendee email (logged-in or finished guests): 12–13
   *   hours after creation, link to the registration page (unchanged behaviour).
   * - Guests who saved a "pay later" email: about 12 hours before their hold expires,
   *   with a signed resume link (never the raw access token).
   * Capped per run to stay inside Vercel's 10 s limit.
   */
  async remindPendingRegistrations(): Promise<{ reminded: number }> {
    const now = Date.now();
    const twelveHoursAgo = new Date(now - 12 * 60 * 60 * 1000);
    const thirteenHoursAgo = new Date(now - 13 * 60 * 60 * 1000);
    const guestHold = this.requireGuestHold();
    const webBase = this.config.get<string>('webUrl') ?? 'https://axontickets.online';
    let reminded = 0;

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

    for (const reg of pending) {
      const lead = reg.attendees[0];
      if (!lead?.email) continue;
      if (!(await guestHold.claimReminder(reg.id))) continue;
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
        await guestHold.releaseReminderClaim(reg.id);
        this.logger.warn({
          msg: 'Payment reminder email failed',
          regId: reg.id,
          err: (err as Error).message,
        });
      }
    }

    const guestHolds = await this.prisma.registration.findMany({
      where: {
        status: 'pending_payment',
        userId: null,
        guestResumeEmail: { not: null },
        holdExpiresAt: {
          gte: new Date(now + 11 * 60 * 60 * 1000),
          lte: new Date(now + 12 * 60 * 60 * 1000),
        },
      },
      orderBy: { holdExpiresAt: 'asc' },
      take: 200,
      select: {
        id: true,
        referenceNumber: true,
        guestResumeEmail: true,
        holdExpiresAt: true,
        event: { select: { title: true, slug: true } },
      },
    });

    for (const reg of guestHolds) {
      if (!reg.guestResumeEmail || !reg.holdExpiresAt) continue;
      if (!(await guestHold.claimReminder(reg.id))) continue;
      const sent = await this.emailService.sendGuestHoldReminderEmail(reg.guestResumeEmail, {
        eventTitle: reg.event.title,
        referenceNumber: reg.referenceNumber,
        resumeUrl:
          `${webBase}/events/${reg.event.slug}/register/resume` +
          `#t=${guestHold.signResumeToken(reg.id, reg.holdExpiresAt)}`,
        holdExpiresAt: reg.holdExpiresAt,
      });
      if (sent) {
        reminded++;
      } else {
        await guestHold.releaseReminderClaim(reg.id);
        this.logger.warn({ msg: 'Guest hold reminder email failed', regId: reg.id });
      }
    }

    if (reminded > 0) this.logger.log({ msg: 'Payment reminders sent', reminded });
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
          workspaceUrl: `${webBase}/admin/events/${item.workspace.event.id}/my-tasks?task=${item.id}`,
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
              { guestResumeEmail: { not: null } },
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
                guestResumeEmail: null,
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
   * Unpaid-hold cleanup. The cron workflow runs it every 5 minutes, so a hold lasts
   * its deadline plus up to ~5 minutes.
   *
   * Two explicit rules (never COALESCE, so NULL is handled exactly):
   *  1. Guest holds with a stored deadline: cancelled once `holdExpiresAt` has passed
   *     (60 minutes by default, 24 hours after the guest saved an email).
   *  2. Everything else (logged-in users, rows from before the deadline column existed):
   *     cancelled when still `pending_payment` 24 hours after creation, as before.
   *
   * Each cancel goes through the shared release helper, which re-checks that the row is
   * still an unpaid hold with no proof and returns the seats. Capped at 100 rows per
   * run and stopped at a 7-second budget; rows are independent so partial runs are safe.
   */
  async cleanupOrphanRegistrations(): Promise<void> {
    const startedAt = Date.now();
    const expiredInclusionHolds = await this.optionalInclusions?.expireDueReservations() ?? 0;
    if (expiredInclusionHolds > 0) {
      this.logger.log({ msg: 'Expired optional inclusion holds released', count: expiredInclusionHolds });
    }
    const now = new Date();
    const legacyCutoff = new Date(now.getTime() - LEGACY_HOLD_MS);

    const [deadlinePassed, legacyStale] = await Promise.all([
      this.prisma.registration.findMany({
        where: { status: 'pending_payment', holdExpiresAt: { lt: now } },
        orderBy: { createdAt: 'asc' },
        take: CLEANUP_BATCH,
        select: { id: true },
      }),
      this.prisma.registration.findMany({
        where: { status: 'pending_payment', holdExpiresAt: null, createdAt: { lt: legacyCutoff } },
        orderBy: { createdAt: 'asc' },
        take: CLEANUP_BATCH,
        select: { id: true },
      }),
    ]);

    const work = [
      ...deadlinePassed.map((r) => ({ id: r.id, reason: 'Guest checkout hold expired' })),
      ...legacyStale.map((r) => ({ id: r.id, reason: 'Registration abandoned' })),
    ];
    if (!work.length) return;

    this.logger.log({ msg: 'Hold cleanup: found expired holds', count: work.length });

    for (const item of work) {
      if (Date.now() - startedAt > CLEANUP_BUDGET_MS) {
        this.logger.warn({ msg: 'Hold cleanup stopped at its time budget; the next run continues' });
        break;
      }
      try {
        const result = await this.requireHolds().releasePendingHold(item.id, {
          reason: item.reason,
          auditAction: 'REGISTRATION_AUTO_CANCELLED',
          inclusionMovement: 'expire',
        });
        if (result.released) this.logger.log({ msg: 'Expired hold cancelled', id: item.id });
      } catch (err: unknown) {
        this.logger.error({
          msg: 'Hold cleanup failed for registration',
          id: item.id,
          err: (err as Error).message,
        });
      }
    }
  }
}
