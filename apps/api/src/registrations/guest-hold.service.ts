import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, hkdfSync, timingSafeEqual } from 'crypto';
import { RedisService } from '../redis/redis.service';

const HKDF_SALT = 'axon-tickets:guest-hold:v1';
const TOKEN_INFO = 'axon:guest-resume:v1';
const LIMITS_INFO = 'axon:guest-limits:v1';

const HOUR_SECONDS = 3600;
const DAY_SECONDS = 86_400;

/** Per-registration, per-recipient and per-IP limits for the "email me my link" feature. */
const RESUME_MAIL_PER_REGISTRATION = 3;
const RESUME_MAIL_PER_RECIPIENT = 3;
const RESUME_MAIL_PER_IP_PER_HOUR = 10;
const RESUME_MAIL_COOLDOWN_SECONDS = 60;
const RESUME_EXCHANGE_PER_IP_PER_HOUR = 20;
const REMINDER_MARKER_SECONDS = 2 * DAY_SECONDS;

/** `v1.<uuid>.<expiryEpochSeconds>.<43-char base64url HMAC-SHA256>` */
export const RESUME_TOKEN_PATTERN =
  /^v1\.[0-9a-f-]{36}\.\d{1,13}\.[A-Za-z0-9_-]{43}$/;

export interface HoldSlot {
  allowed: boolean;
  /** Redis counter key to bind to the new registration so a release can undo the count. */
  counterKey?: string;
}

/**
 * Deadlines, caps, limits and the signed resume token for unpaid guest checkouts.
 *
 * Everything here is server-side: no deadline, count or limit is ever read from a
 * request. Redis keys are built from keyed hashes (HMAC) of IPs and emails, so the
 * raw values are never stored and the keys cannot be enumerated.
 *
 * Failure policy (see the spec): the hold cap fails OPEN (checkout must keep working),
 * the extended-hold cap and every email limit fail CLOSED.
 */
@Injectable()
export class GuestHoldService {
  private readonly logger = new Logger(GuestHoldService.name);
  private readonly derivedKeys = new Map<string, Buffer>();

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  // ── Configuration ────────────────────────────────────────────────────────

  get holdMinutes(): number {
    return this.config.get<number>('guestHold.minutes') ?? 60;
  }
  get extendedHours(): number {
    return this.config.get<number>('guestHold.extendedHours') ?? 24;
  }
  get holdsPerIp(): number {
    return this.config.get<number>('guestHold.perIp') ?? 5;
  }
  get extendedHoldsPerIp(): number {
    return this.config.get<number>('guestHold.extendedPerIp') ?? 2;
  }

  // ── Deadlines ────────────────────────────────────────────────────────────

  initialDeadline(now = new Date()): Date {
    return new Date(now.getTime() + this.holdMinutes * 60_000);
  }

  extendedDeadline(now = new Date()): Date {
    return new Date(now.getTime() + this.extendedHours * 3_600_000);
  }

  /** A hold deadline is never moved earlier than the one it already has. */
  laterOf(existing: Date | null | undefined, candidate: Date): Date {
    return existing && existing.getTime() > candidate.getTime() ? existing : candidate;
  }

  // ── Hold-creation cap (fails open) ───────────────────────────────────────

  async acquireCreateSlot(eventId: string, ip: string | undefined): Promise<HoldSlot> {
    if (!ip) {
      this.logger.warn({ msg: 'Guest hold cap skipped: request IP unknown' });
      return { allowed: true };
    }
    try {
      const counterKey = `guest-hold:${eventId}:${this.keyed(ip)}`;
      const { count } = await this.redis.incrementWithTtl(counterKey, HOUR_SECONDS);
      if (count > this.holdsPerIp) {
        await this.redis.decrementIfPositive(counterKey);
        return { allowed: false };
      }
      return { allowed: true, counterKey };
    } catch (err: unknown) {
      this.logger.warn({ msg: 'Guest hold cap unavailable; failing open', err: (err as Error).message });
      return { allowed: true };
    }
  }

  /** Remember which counter a registration was counted against so a release can undo it. */
  async bindSlot(registrationId: string, counterKey: string | undefined): Promise<void> {
    if (!counterKey) return;
    try {
      await this.redis.set(`guest-hold-reg:${registrationId}`, counterKey, HOUR_SECONDS);
    } catch (err: unknown) {
      this.logger.warn({ msg: 'Could not bind guest hold slot', err: (err as Error).message });
    }
  }

  /** Undo a count taken for a hold that was never created (creation failed). */
  async undoSlot(counterKey: string | undefined): Promise<void> {
    if (!counterKey) return;
    try {
      await this.redis.decrementIfPositive(counterKey);
    } catch (err: unknown) {
      this.logger.warn({ msg: 'Could not undo guest hold slot', err: (err as Error).message });
    }
  }

  /** Called on every release path. Best effort: never throws. */
  async releaseSlot(registrationId: string): Promise<void> {
    try {
      const mappingKey = `guest-hold-reg:${registrationId}`;
      const counterKey = await this.redis.get(mappingKey);
      if (!counterKey) return;
      await this.redis.decrementIfPositive(counterKey);
      await this.redis.del(mappingKey);
    } catch (err: unknown) {
      this.logger.warn({ msg: 'Could not release guest hold slot', err: (err as Error).message });
    }
  }

  // ── Extended-hold cap (fails closed) ─────────────────────────────────────

  async acquireExtendedSlot(eventId: string, ip: string | undefined): Promise<boolean> {
    if (!ip) return false;
    try {
      const key = `guest-ext:${eventId}:${this.keyed(ip)}`;
      const { count } = await this.redis.incrementWithTtl(key, DAY_SECONDS);
      return count <= this.extendedHoldsPerIp;
    } catch (err: unknown) {
      this.logger.warn({ msg: 'Extended guest hold cap unavailable; not extending', err: (err as Error).message });
      return false;
    }
  }

  // ── Email limits (fail closed) ───────────────────────────────────────────

  /** True only when ALL limits allow a send. Redis trouble means no send. */
  async allowResumeEmail(input: { registrationId: string; email: string; ip: string | undefined }): Promise<boolean> {
    try {
      const cooldown = await this.redis.setIfNotExists(
        `resume-mail-cd:${input.registrationId}`,
        '1',
        RESUME_MAIL_COOLDOWN_SECONDS,
      );
      if (!cooldown) return false;

      const perRegistration = await this.redis.incrementWithTtl(
        `resume-mail-reg:${input.registrationId}`,
        DAY_SECONDS,
      );
      if (perRegistration.count > RESUME_MAIL_PER_REGISTRATION) return false;

      const perRecipient = await this.redis.incrementWithTtl(
        `resume-mail-rcpt:${this.keyed(input.email.trim().toLowerCase())}`,
        DAY_SECONDS,
      );
      if (perRecipient.count > RESUME_MAIL_PER_RECIPIENT) return false;

      if (!input.ip) return false;
      const perIp = await this.redis.incrementWithTtl(
        `resume-mail-ip:${this.keyed(input.ip)}`,
        HOUR_SECONDS,
      );
      return perIp.count <= RESUME_MAIL_PER_IP_PER_HOUR;
    } catch (err: unknown) {
      this.logger.warn({ msg: 'Resume email limiter unavailable; not sending', err: (err as Error).message });
      return false;
    }
  }

  /** Resume-link exchange limit. Fails open: the signature cannot be forged, so this only bounds cost. */
  async allowResumeExchange(ip: string | undefined): Promise<boolean> {
    if (!ip) return true;
    try {
      const { count } = await this.redis.incrementWithTtl(
        `resume-ex-ip:${this.keyed(ip)}`,
        HOUR_SECONDS,
      );
      return count <= RESUME_EXCHANGE_PER_IP_PER_HOUR;
    } catch (err: unknown) {
      this.logger.warn({ msg: 'Resume exchange limiter unavailable; failing open', err: (err as Error).message });
      return true;
    }
  }

  // ── Reminder de-duplication ──────────────────────────────────────────────

  /** Atomically claim the right to send a registration's reminder. False on Redis trouble. */
  async claimReminder(registrationId: string): Promise<boolean> {
    try {
      return await this.redis.setIfNotExists(
        `payment-reminder:${registrationId}`,
        '1',
        REMINDER_MARKER_SECONDS,
      );
    } catch (err: unknown) {
      this.logger.warn({ msg: 'Reminder marker unavailable; skipping reminder', err: (err as Error).message });
      return false;
    }
  }

  async releaseReminderClaim(registrationId: string): Promise<void> {
    try {
      await this.redis.del(`payment-reminder:${registrationId}`);
    } catch (err: unknown) {
      this.logger.warn({ msg: 'Could not clear reminder marker', err: (err as Error).message });
    }
  }

  // ── Signed resume token ──────────────────────────────────────────────────

  signResumeToken(registrationId: string, expiresAt: Date): string {
    const exp = Math.floor(expiresAt.getTime() / 1000);
    return `v1.${registrationId}.${exp}.${this.signature(registrationId, exp)}`;
  }

  /**
   * Verifies format, signature (constant time) and expiry. Touches no database.
   * Returns null for every kind of failure so callers can answer uniformly.
   */
  verifyResumeToken(token: string, now = new Date()): { registrationId: string; expiresAt: Date } | null {
    if (typeof token !== 'string' || !RESUME_TOKEN_PATTERN.test(token)) return null;
    const [, registrationId, expRaw, signature] = token.split('.');
    const exp = Number(expRaw);
    if (!Number.isSafeInteger(exp)) return null;

    const expected = Buffer.from(this.signature(registrationId, exp));
    const supplied = Buffer.from(signature);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
    if (exp * 1000 <= now.getTime()) return null;
    return { registrationId, expiresAt: new Date(exp * 1000) };
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private signature(registrationId: string, exp: number): string {
    return createHmac('sha256', this.derive(TOKEN_INFO))
      .update(`guest-resume:v1:${registrationId}:${exp}`)
      .digest('base64url');
  }

  /** Keyed hash for Redis keys: raw IPs and emails are never stored. */
  private keyed(value: string): string {
    return createHmac('sha256', this.derive(LIMITS_INFO)).update(value).digest('hex').slice(0, 40);
  }

  /** HKDF-SHA256 from the configured JWT private key, one derived key per purpose, cached. */
  private derive(info: string): Buffer {
    const cached = this.derivedKeys.get(info);
    if (cached) return cached;
    const material = this.config.get<string>('jwt.privateKey') ?? '';
    if (material.length < 32) {
      // Never fall back to a weak or empty key: fail the request instead.
      throw new ServiceUnavailableException('Guest checkout is temporarily unavailable.');
    }
    const key = Buffer.from(hkdfSync('sha256', material, HKDF_SALT, info, 32));
    this.derivedKeys.set(info, key);
    return key;
  }
}
