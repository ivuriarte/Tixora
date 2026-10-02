import {
  Controller,
  Get,
  Post,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { ReservationsService } from '../reservations/reservations.service';
import { SchedulerService } from '../scheduler/scheduler.service';

/** Constant-time string comparison (hashes first so length differences leak nothing). */
export function safeEqual(candidate: string | undefined, expected: string): boolean {
  if (!candidate) return false;
  const a = createHash('sha256').update(candidate).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * HTTP-based cron trigger endpoints.
 *
 * These endpoints replace unreliable in-process @Cron decorators on Vercel
 * serverless (containers die after ~10 min idle, killing all NestJS cron jobs).
 * A GitHub Actions scheduled workflow (.github/workflows/cron.yml) calls them
 * on the required schedule, keeping the jobs alive independently of container
 * lifecycle.
 *
 * All endpoints verify the X-Cron-Secret header against the CRON_SECRET env
 * var — no JWT required, no admin cookie needed. Add CRON_SECRET to:
 *   - Vercel env vars (for the API project)
 *   - GitHub repo secrets (for the Actions workflow)
 */
@Controller('cron')
export class CronController {
  private readonly logger = new Logger(CronController.name);

  constructor(
    private readonly reservationsService: ReservationsService,
    private readonly schedulerService: SchedulerService,
  ) {}

  private verifySecret(secret: string | undefined, authorization?: string): void {
    const expected = process.env.CRON_SECRET;
    const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
    if (!expected || !(safeEqual(secret, expected) || safeEqual(bearer, expected))) {
      throw new UnauthorizedException('Invalid or missing cron secret');
    }
  }

  /**
   * POST /api/v1/cron/release-reservations
   * Triggered every 5 minutes by GitHub Actions.
   * Marks expired reservations as expired and restores Redis inventory.
   */
  @Post('release-reservations')
  @HttpCode(HttpStatus.OK)
  async releaseReservations(
    @Headers('x-cron-secret') secret: string | undefined,
  ) {
    this.verifySecret(secret);
    this.logger.log({ msg: 'External cron: release-reservations triggered' });
    await this.reservationsService.releaseExpiredReservations();
    return { ok: true };
  }

  /**
   * POST /api/v1/cron/auto-cancel-registrations
   * Triggered every hour by GitHub Actions.
   * Cancels pending_payment registrations whose tier sale period has ended.
   */
  @Post('auto-cancel-registrations')
  @HttpCode(HttpStatus.OK)
  async autoCancelRegistrations(
    @Headers('x-cron-secret') secret: string | undefined,
  ) {
    this.verifySecret(secret);
    this.logger.log({ msg: 'External cron: auto-cancel-registrations triggered' });
    await this.schedulerService.autoCancelExpiredRegistrations();
    return { ok: true };
  }

  /**
   * POST /api/v1/cron/cleanup-orphan-registrations
   * Triggered every hour by GitHub Actions.
   * Cancels expired unpaid holds: guest holds past their deadline (60 minutes by default,
   * 24 hours once the guest saved an email) and other pending_payment registrations older
   * than 24 hours. Capped at 100 rows per rule per run; safe to run every 5 minutes.
   */
  @Post('cleanup-orphan-registrations')
  @HttpCode(HttpStatus.OK)
  async cleanupOrphanRegistrations(
    @Headers('x-cron-secret') secret: string | undefined,
  ) {
    this.verifySecret(secret);
    this.logger.log({ msg: 'External cron: cleanup-orphan-registrations triggered' });
    await this.schedulerService.cleanupOrphanRegistrations();
    return { ok: true };
  }

  /**
   * POST /api/v1/cron/remind-pending-registrations
   * Triggered every hour by GitHub Actions.
   * Sends each unpaid registration ONE reminder (Redis marker): lead-attendee registrations 12–13
   * hours after creation, and guests who saved an email about 12 hours before their hold expires.
   */
  @Post('remind-pending-registrations')
  @HttpCode(HttpStatus.OK)
  async remindPendingRegistrations(
    @Headers('x-cron-secret') secret: string | undefined,
  ) {
    this.verifySecret(secret);
    this.logger.log({ msg: 'External cron: remind-pending-registrations triggered' });
    const result = await this.schedulerService.remindPendingRegistrations();
    return { ok: true, reminded: result.reminded };
  }

  /**
   * POST /api/v1/cron/cleanup-otp-codes
   * Triggered daily by GitHub Actions.
   * Deletes expired and used OtpCode records.
   */
  @Post('cleanup-otp-codes')
  @HttpCode(HttpStatus.OK)
  async cleanupOtpCodes(
    @Headers('x-cron-secret') secret: string | undefined,
  ) {
    this.verifySecret(secret);
    this.logger.log({ msg: 'External cron: cleanup-otp-codes triggered' });
    await this.schedulerService.cleanupExpiredOtpCodes();
    return { ok: true };
  }

  @Post('enforce-attendee-retention')
  @HttpCode(HttpStatus.OK)
  async enforceAttendeeRetention(
    @Headers('x-cron-secret') secret: string | undefined,
  ) {
    this.verifySecret(secret);
    this.logger.log({ msg: 'External cron: enforce-attendee-retention triggered' });
    const result = await this.schedulerService.enforceAttendeeRetention();
    return { ok: true, ...result };
  }

  /** Daily at 08:00 Asia/Manila. Sends idempotent due-date digests to the
   * verified Responsible and Accountable members linked to each task. */
  @Get('workspace-due-reminders')
  @HttpCode(HttpStatus.OK)
  async workspaceDueRemindersFromVercel(
    @Headers('authorization') authorization: string | undefined,
  ) {
    this.verifySecret(undefined, authorization);
    return this.runWorkspaceDueReminders();
  }

  @Post('workspace-due-reminders')
  @HttpCode(HttpStatus.OK)
  async workspaceDueRemindersFromGitHub(
    @Headers('x-cron-secret') secret: string | undefined,
  ) {
    this.verifySecret(secret);
    return this.runWorkspaceDueReminders();
  }

  private async runWorkspaceDueReminders() {
    this.logger.log({ msg: 'External cron: workspace-due-reminders triggered' });
    const result = await this.schedulerService.sendWorkspaceDueReminders();
    return { ok: true, ...result };
  }
}
