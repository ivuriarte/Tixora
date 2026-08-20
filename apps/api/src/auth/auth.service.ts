import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  Logger,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { createHash, randomInt } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EmailService } from '../email/email.service';
import { FunnelService } from '../funnel/funnel.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto, VerifyOtpDto, RequestAccessDto, VerifyAccessDto } from './dto/auth.dto';
import { JwtPayload } from '@axon-tickets/types';

const BCRYPT_COST = 12;
const OTP_TTL_SECONDS = 300; // 5 minutes
const OTP_DIGITS = 6;
const OTP_MAX_ATTEMPTS = 5;
const OTP_ATTEMPT_TTL = OTP_TTL_SECONDS + 60; // slightly longer than OTP TTL
const OTP_HOURLY_TTL_SECONDS = 60 * 60;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly emailService: EmailService,
    private readonly funnel: FunnelService,
  ) {}

  async register(dto: RegisterDto, ip: string): Promise<{ userId: string; message: string }> {
    await this.verifyCaptcha(dto.captchaToken, ip);
    let birthday: Date | null = null;
    if (dto.birthday) {
      birthday = new Date(`${dto.birthday}T00:00:00.000Z`);
      const earliest = new Date();
      earliest.setUTCFullYear(earliest.getUTCFullYear() - 120);
      if (!Number.isFinite(birthday.getTime()) || birthday > new Date() || birthday < earliest) {
        throw new BadRequestException('Birthday must be a valid past date within the last 120 years.');
      }
    }

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone ?? null,
        company: dto.company ?? null,
        jobTitle: dto.jobTitle ?? null,
        city: dto.city?.trim() || null,
        birthday,
        gender: dto.gender || null,
      },
    });

    await this.sendOtp(user.id, user.email, 'email_verify');

    return { userId: user.id, message: 'Check your email for a verification code.' };
  }

  async login(dto: LoginDto): Promise<{
    user: { id: string; email: string; firstName: string; lastName: string; isAdmin: boolean; isOrganizer: boolean; isVerified: boolean };
    accessToken: string;
    refreshToken: string;
  }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const match = await bcrypt.compare(dto.password, user.passwordHash);
    if (!match) throw new UnauthorizedException('Invalid email or password');

    if (!user.isVerified) {
      // Throttle OTP resend within unverified login
      const recentOtp = await this.prisma.otpCode.findFirst({
        where: { userId: user.id, type: 'email_verify', used: false, createdAt: { gt: new Date(Date.now() - 60_000) } },
      });
      if (!recentOtp) await this.sendOtp(user.id, user.email, 'email_verify');
      throw new HttpException(
        { message: 'Please verify your email. A new code has been sent.', userId: user.id },
        HttpStatus.FORBIDDEN,
      );
    }

    const [accessToken, refreshToken] = await Promise.all([
      this.generateAccessToken(user.id, user.email, user.isAdmin),
      this.generateRefreshToken(user.id),
    ]);
    const isOrganizer = await this.isApprovedOrganizer(user.id);

    return {
      user: { id: user.id, email: user.email, firstName: user.firstName!, lastName: user.lastName!, isAdmin: user.isAdmin, isOrganizer, isVerified: user.isVerified },
      accessToken,
      refreshToken,
    };
  }

  async verifyOtp(dto: VerifyOtpDto): Promise<{
    user: { id: string; email: string; firstName: string; lastName: string; isAdmin: boolean; isOrganizer: boolean; isVerified: boolean };
    accessToken: string;
    refreshToken: string;
  }> {
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new BadRequestException('Invalid request');

    // Brute-force protection: track failed attempts in Redis
    const attemptsKey = `otp:attempts:${dto.userId}`;
    const attempts = parseInt((await this.redis.get(attemptsKey)) ?? '0', 10);
    if (attempts >= OTP_MAX_ATTEMPTS) {
      throw new BadRequestException('Too many failed attempts. Request a new verification code.');
    }

    const otpRecord = await this.prisma.otpCode.findFirst({
      where: {
        userId: dto.userId,
        type: 'email_verify',
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) throw new BadRequestException('OTP expired or invalid. Request a new one.');

    const match = await bcrypt.compare(dto.otp, otpRecord.codeHash);
    if (!match) {
      // Increment failure counter
      const newCount = attempts + 1;
      await this.redis.set(attemptsKey, String(newCount), OTP_ATTEMPT_TTL);
      if (newCount >= OTP_MAX_ATTEMPTS) {
        // Invalidate the OTP so attacker cannot succeed even if throttle is bypassed
        await this.prisma.otpCode.update({ where: { id: otpRecord.id }, data: { used: true } });
        throw new BadRequestException('Too many failed attempts. Request a new verification code.');
      }
      throw new BadRequestException('Incorrect verification code');
    }

    // Clear attempt counter on success
    await this.redis.del(attemptsKey);

    // Mark OTP as used and verify user atomically
    await this.prisma.$transaction([
      this.prisma.otpCode.update({ where: { id: otpRecord.id }, data: { used: true } }),
      this.prisma.user.update({ where: { id: dto.userId }, data: { isVerified: true } }),
    ]);

    await this.acceptPendingOrganizationInvitation(user.id, user.email);

    const [accessToken, refreshToken] = await Promise.all([
      this.generateAccessToken(user.id, user.email, user.isAdmin),
      this.generateRefreshToken(user.id),
    ]);
    const isOrganizer = await this.isApprovedOrganizer(user.id);

    return {
      user: { id: user.id, email: user.email, firstName: user.firstName!, lastName: user.lastName!, isAdmin: user.isAdmin, isOrganizer, isVerified: true },
      accessToken,
      refreshToken,
    };
  }

  async resendOtp(userId: string, req?: Request): Promise<{ message: string }> {
    await this.enforceOtpHourlyLimit(req);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('Invalid request');
    if (user.isVerified) throw new BadRequestException('Account already verified');

    // Rate limit: check if an OTP was sent in last 60s
    const recentOtp = await this.prisma.otpCode.findFirst({
      where: {
        userId,
        type: 'email_verify',
        used: false,
        createdAt: { gt: new Date(Date.now() - 60_000) },
      },
    });
    if (recentOtp) {
      throw new BadRequestException('Please wait 60 seconds before requesting a new code');
    }

    await this.sendOtp(userId, user.email, 'email_verify');
    return { message: 'Verification code sent' };
  }

  async refreshTokens(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    let userId: string;
    let jti: string;

    try {
      const decoded = this.jwt.verify<{ sub: string; jti: string }>(refreshToken, {
        algorithms: ['RS256'],
      });
      userId = decoded.sub;
      jti = decoded.jti;
    } catch {
      // JWT errors (expired, invalid signature, malformed) must surface as 401, not 500
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const key = `refresh:${userId}:${jti}`;
    const stored = await this.redis.get(key);
    if (!stored) throw new UnauthorizedException('Refresh token revoked or expired');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    // Rotate: revoke old, issue new
    await this.redis.del(key);
    const newAccessToken = await this.generateAccessToken(user.id, user.email, user.isAdmin);
    const newRefreshToken = await this.generateRefreshToken(user.id);

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    try {
      const { jti } = this.jwt.decode<{ jti: string }>(refreshToken) ?? {};
      if (jti) await this.redis.del(`refresh:${userId}:${jti}`);
    } catch {
      // Silently ignore invalid tokens on logout
    }
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        isVerified: true,
        isAdmin: true,
        organizationMembers: {
          where: { organization: { approvalStatus: 'approved' } },
          select: { id: true },
          take: 1,
        },
        createdAt: true,
      },
    });
    const { organizationMembers, ...rest } = user;
    return { ...rest, isOrganizer: organizationMembers.length > 0 };
  }

  /**
   * Step 1 of the passwordless access flow.
   * Finds or creates a stub user by email, then sends a 6-digit OTP.
   * Always returns { userId } — never distinguishes new vs existing (prevents enumeration).
   */
  async requestAccess(dto: RequestAccessDto, req?: Request): Promise<{ userId: string }> {
    await this.enforceOtpHourlyLimit(req);

    const email = dto.email.toLowerCase().trim();
    const userAgent = req?.headers['user-agent'] as string | undefined;
    const referrer = (req?.headers['referer'] as string | undefined) ?? undefined;

    this.logger.log({ msg: 'OTP send requested', email, eventId: dto.eventId ?? null });

    let user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      // New user: create stub with whatever profile fields were provided.
      // When firstName is set here, verifyAccess() will return isNewUser=false
      // so the registration wizard never shows the separate profile step.
      user = await this.prisma.user.create({
        data: {
          email,
          isVerified: false,
          firstName: dto.firstName?.trim() ?? null,
          lastName: dto.lastName?.trim() ?? null,
          phone: dto.phone?.trim() || null,
        },
      });
    } else if (user.firstName === null && dto.firstName) {
      // Existing stub user with no profile yet — fill it in now.
      user = await this.prisma.user.update({
        where: { email },
        data: {
          firstName: dto.firstName.trim(),
          lastName: dto.lastName?.trim() ?? null,
          phone: dto.phone?.trim() || null,
        },
      });
    }

    // Rate-limit: one OTP per 60 seconds per user
    const recentOtp = await this.prisma.otpCode.findFirst({
      where: {
        userId: user.id,
        type: 'email_verify',
        used: false,
        createdAt: { gt: new Date(Date.now() - 60_000) },
      },
    });
    if (recentOtp) {
      await this.funnel.track(
        {
          eventId: dto.eventId,
          sessionId: dto.sessionId,
          userId: user.id,
          email,
          step: 'otp_send_failed',
          status: 'blocked',
          metadata: {
            reason: 'cooldown_active',
            eventSlug: dto.eventSlug ?? null,
            returnUrl: dto.returnUrl ?? null,
          },
        },
        { userAgent, referrer },
      );
      throw new BadRequestException('Please wait 60 seconds before requesting a new code');
    }

    await this.funnel.track(
      {
        eventId: dto.eventId,
        sessionId: dto.sessionId,
        userId: user.id,
        email,
        step: 'otp_send_requested',
        status: 'started',
        metadata: {
          eventSlug: dto.eventSlug ?? null,
          eventName: dto.eventName ?? null,
          returnUrl: dto.returnUrl ?? null,
        },
      },
      { userAgent, referrer },
    );

    const sent = await this.sendOtp(user.id, email, 'email_verify');
    if (!sent) {
      await this.funnel.track(
        {
          eventId: dto.eventId,
          sessionId: dto.sessionId,
          userId: user.id,
          email,
          step: 'otp_send_failed',
          status: 'failed',
          metadata: {
            reason: 'provider_send_failed',
            eventSlug: dto.eventSlug ?? null,
            returnUrl: dto.returnUrl ?? null,
          },
        },
        { userAgent, referrer },
      );
      throw new BadRequestException('Could not send code right now. Please try again.');
    }

    await this.funnel.track(
      {
        eventId: dto.eventId,
        sessionId: dto.sessionId,
        userId: user.id,
        email,
        step: 'otp_sent',
        status: 'success',
        metadata: {
          eventSlug: dto.eventSlug ?? null,
          returnUrl: dto.returnUrl ?? null,
        },
      },
      { userAgent, referrer },
    );

    this.logger.log({ msg: 'OTP send success', userId: user.id, eventId: dto.eventId ?? null });
    return { userId: user.id };
  }

  /**
   * Distributed OTP abuse protection.
   *
   * This belongs in Redis rather than a named Nest throttler because named
   * throttlers are global by default. Registering an "otp-hourly" throttler
   * globally caused every API route (events, login, registration, health) to
   * inherit the 10 requests/hour ceiling.
   */
  private async enforceOtpHourlyLimit(req?: Request): Promise<void> {
    const tracker = this.getTrustedIp(req);
    const trackerHash = createHash('sha256').update(tracker).digest('hex');
    const key = `rate-limit:otp-hourly:${trackerHash}`;
    const limit = this.config.get<number>('throttle.otpHourlyLimit') ?? 10;
    const result = await this.redis.incrementWithTtl(key, OTP_HOURLY_TTL_SECONDS);

    if (result.count > limit) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many verification code requests. Please try again later.',
          retryAfterSeconds: result.ttlSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private getTrustedIp(req?: Request): string {
    if (!req) return 'unknown';

    const realIp = req.headers['x-real-ip'];
    if (typeof realIp === 'string' && realIp.trim()) {
      return realIp.trim();
    }

    const forwardedFor = req.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string') {
      const ips = forwardedFor.split(',');
      return ips[ips.length - 1].trim() || req.ip || 'unknown';
    }

    return req.ip || 'unknown';
  }

  /**
   * Step 2 of the passwordless access flow.
   * Verifies the OTP, marks the user as verified, and returns a JWT pair.
   * isNewUser = true when the account was created via requestAccess and has no profile yet.
   */
  async verifyAccess(dto: VerifyAccessDto, req?: Request): Promise<{
    user: { id: string; email: string; firstName: string | null; lastName: string | null; isAdmin: boolean; isOrganizer: boolean; isVerified: boolean };
    accessToken: string;
    refreshToken: string;
    isNewUser: boolean;
    isExistingAccount: boolean;
    orgApprovalStatus: string | null;
  }> {
    const userAgent = req?.headers['user-agent'] as string | undefined;
    const referrer = (req?.headers['referer'] as string | undefined) ?? undefined;

    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new BadRequestException('Invalid request');

    // Brute-force protection (shared with verifyOtp)
    const attemptsKey = `otp:attempts:${dto.userId}`;
    const attempts = parseInt((await this.redis.get(attemptsKey)) ?? '0', 10);
    if (attempts >= OTP_MAX_ATTEMPTS) {
      await this.funnel.track(
        {
          eventId: dto.eventId,
          sessionId: dto.sessionId,
          userId: dto.userId,
          email: user.email,
          step: 'otp_verification_failed',
          status: 'blocked',
          metadata: { reason: 'too_many_attempts' },
        },
        { userAgent, referrer },
      );
      throw new BadRequestException('Too many failed attempts. Request a new code.');
    }

    const otpRecord = await this.prisma.otpCode.findFirst({
      where: {
        userId: dto.userId,
        type: 'email_verify',
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      await this.funnel.track(
        {
          eventId: dto.eventId,
          sessionId: dto.sessionId,
          userId: dto.userId,
          email: user.email,
          step: 'otp_verification_failed',
          status: 'failed',
          metadata: { reason: 'otp_expired_or_missing' },
        },
        { userAgent, referrer },
      );
      throw new BadRequestException('Code expired or invalid. Request a new one.');
    }

    const match = await bcrypt.compare(dto.otp, otpRecord.codeHash);
    if (!match) {
      const newCount = attempts + 1;
      await this.redis.set(attemptsKey, String(newCount), OTP_ATTEMPT_TTL);
      await this.funnel.track(
        {
          eventId: dto.eventId,
          sessionId: dto.sessionId,
          userId: dto.userId,
          email: user.email,
          step: 'otp_verification_failed',
          status: 'failed',
          metadata: { reason: 'incorrect_code', attemptCount: newCount },
        },
        { userAgent, referrer },
      );
      if (newCount >= OTP_MAX_ATTEMPTS) {
        await this.prisma.otpCode.update({ where: { id: otpRecord.id }, data: { used: true } });
        throw new BadRequestException('Too many failed attempts. Request a new code.');
      }
      throw new BadRequestException('Incorrect code. Please try again.');
    }

    await this.redis.del(attemptsKey);

    const isNewUser = user.firstName === null;

    await this.prisma.$transaction([
      this.prisma.otpCode.update({ where: { id: otpRecord.id }, data: { used: true } }),
      this.prisma.user.update({ where: { id: dto.userId }, data: { isVerified: true } }),
    ]);

    await this.acceptPendingOrganizationInvitation(user.id, user.email);

    const [accessToken, refreshToken] = await Promise.all([
      this.generateAccessToken(user.id, user.email, user.isAdmin),
      this.generateRefreshToken(user.id),
    ]);
    const [isOrganizer, orgMembership] = await Promise.all([
      this.isApprovedOrganizer(user.id),
      this.prisma.organizationMember.findFirst({
        where: { userId: user.id },
        select: { organization: { select: { approvalStatus: true } } },
      }),
    ]);
    const orgApprovalStatus = orgMembership?.organization.approvalStatus ?? null;

    await this.funnel.track(
      {
        eventId: dto.eventId,
        sessionId: dto.sessionId,
        userId: user.id,
        email: user.email,
        step: 'otp_verified',
        status: 'success',
        metadata: {
          isNewUser,
          eventSlug: dto.eventSlug ?? null,
          returnUrl: dto.returnUrl ?? null,
        },
      },
      { userAgent, referrer },
    );

    this.logger.log({ msg: 'OTP verify success', userId: user.id, isNewUser });

    return {
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, isAdmin: user.isAdmin, isOrganizer, isVerified: true },
      accessToken,
      refreshToken,
      isNewUser,
      // true when the email already belonged to a verified account before this OTP flow
      isExistingAccount: user.isVerified,
      orgApprovalStatus,
    };
  }

  private async sendOtp(userId: string, email: string, type: 'email_verify'): Promise<boolean> {
    const code = this.generateOtpCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);

    await this.prisma.otpCode.create({
      data: { userId, codeHash, type, expiresAt },
    });

    const sent = await this.emailService.sendOtpEmail(email, code);

    if (!sent) {
      this.logger.error({
        msg: 'OTP email failed to send after retries',
        userId,
        email,
        type,
      });
    }

    return sent;
  }

  private async acceptPendingOrganizationInvitation(userId: string, rawEmail: string): Promise<void> {
    const email = rawEmail.trim().toLowerCase();
    await this.prisma.organizationInvitation.updateMany({
      where: { email, status: 'pending', expiresAt: { lte: new Date() } },
      data: { status: 'expired' },
    });

    const invitation = await this.prisma.organizationInvitation.findFirst({
      where: {
        email,
        status: 'pending',
        expiresAt: { gt: new Date() },
        organization: { approvalStatus: 'approved' },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!invitation) return;

    const existingOrganization = await this.prisma.organizationMember.findFirst({
      where: { userId },
      select: { organizationId: true },
    });
    if (existingOrganization && existingOrganization.organizationId !== invitation.organizationId) {
      this.logger.warn({
        msg: 'Organization invitation not accepted because user already belongs to another organizer',
        userId,
        invitationId: invitation.id,
      });
      return;
    }

    await this.prisma.organizationMember.upsert({
      where: {
        userId_organizationId: { userId, organizationId: invitation.organizationId },
      },
      update: { role: invitation.role },
      create: { userId, organizationId: invitation.organizationId, role: invitation.role },
    });

    const workspaces = await this.prisma.eventWorkspace.findMany({
      where: { event: { organizationId: invitation.organizationId } },
      select: { id: true },
    });
    if (workspaces.length > 0) {
      await this.prisma.workspaceMember.createMany({
        data: workspaces.map((workspace) => ({
          workspaceId: workspace.id,
          userId,
          role: invitation.role === 'member' ? 'viewer' : 'manager',
        })),
        skipDuplicates: true,
      });
    }

    await this.prisma.organizationInvitation.update({
      where: { id: invitation.id },
      data: { status: 'accepted', acceptedAt: new Date() },
    });
  }

  private generateOtpCode(): string {
    // crypto.randomInt is cryptographically secure — Math.random() is not
    return randomInt(0, 10 ** OTP_DIGITS).toString().padStart(OTP_DIGITS, '0');
  }

  private async generateAccessToken(
    userId: string,
    email: string,
    isAdmin: boolean,
  ): Promise<string> {
    const payload: JwtPayload = { sub: userId, email, isAdmin };
    return this.jwt.signAsync(payload, {
      algorithm: 'RS256',
      expiresIn: this.config.get<string>('jwt.accessExpiry') ?? '15m',
    });
  }

  private async isApprovedOrganizer(userId: string): Promise<boolean> {
    const membership = await this.prisma.organizationMember.findFirst({
      where: {
        userId,
        organization: { approvalStatus: 'approved' },
      },
      select: { id: true },
    });
    return Boolean(membership);
  }

  private async generateRefreshToken(userId: string): Promise<string> {
    const jti = uuidv4();
    const refreshExpiry = this.config.get<string>('jwt.refreshExpiry') ?? '7d';
    const ttlSeconds = 7 * 24 * 60 * 60; // 7 days

    const token = await this.jwt.signAsync(
      { sub: userId, jti },
      { algorithm: 'RS256', expiresIn: refreshExpiry },
    );

    await this.redis.set(`refresh:${userId}:${jti}`, '1', ttlSeconds);
    return token;
  }

  private async verifyCaptcha(token: string, ip: string): Promise<void> {
    const secret = this.config.get<string>('hcaptcha.secret');
    const params = new URLSearchParams({ response: token, secret: secret ?? '', remoteip: ip });

    const res = await fetch('https://hcaptcha.com/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const data = (await res.json()) as { success: boolean };
    if (!data.success) throw new ForbiddenException('CAPTCHA verification failed');
  }
}
