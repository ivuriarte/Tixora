import {
  Controller,
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

  private verifySecret(secret: string | undefined): void {
    const expected = process.env.CRON_SECRET;
    if (!expected || secret !== expected) {
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
}
