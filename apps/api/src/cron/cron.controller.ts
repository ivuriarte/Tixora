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
import { ReservationsService } from '../reservations/reservations.service';
import { SchedulerService } from '../scheduler/scheduler.service';

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
    if (!expected || (secret !== expected && bearer !== expected)) {
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
   * Cancels pending_payment registrations older than 2 hours (abandoned flows).
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
   * Sends a reminder email to attendees whose pending_payment registration is 12–13 hours old.
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

  /** Daily at 08:00 Asia/Manila. Sends idempotent due-date digests to the
   * verified Responsible and Accountable members linked to each task. */
  @Get('workspace-due-reminders')
  @Post('workspace-due-reminders')
  @HttpCode(HttpStatus.OK)
  async workspaceDueReminders(
    @Headers('x-cron-secret') secret: string | undefined,
    @Headers('authorization') authorization: string | undefined,
  ) {
    this.verifySecret(secret, authorization);
    this.logger.log({ msg: 'External cron: workspace-due-reminders triggered' });
    const result = await this.schedulerService.sendWorkspaceDueReminders();
    return { ok: true, ...result };
  }
}
