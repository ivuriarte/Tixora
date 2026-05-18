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
import { randomInt } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EmailService } from '../email/email.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto, VerifyOtpDto } from './dto/auth.dto';
import { JwtPayload } from '@axon-tickets/types';

const BCRYPT_COST = 12;
const OTP_TTL_SECONDS = 300; // 5 minutes
const OTP_DIGITS = 6;
const MAX_ACTIVE_RESERVATIONS = 3;
const OTP_MAX_ATTEMPTS = 5;
const OTP_ATTEMPT_TTL = OTP_TTL_SECONDS + 60; // slightly longer than OTP TTL

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  async register(dto: RegisterDto, ip: string): Promise<{ userId: string; message: string }> {
    await this.verifyCaptcha(dto.captchaToken, ip);

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
        city: dto.city ?? null,
      },
    });

    await this.sendOtp(user.id, user.email, 'email_verify');

    return { userId: user.id, message: 'Check your email for a verification code.' };
  }

  async login(dto: LoginDto): Promise<{
    user: { id: string; email: string; firstName: string; lastName: string; isAdmin: boolean; isVerified: boolean };
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

    return {
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, isAdmin: user.isAdmin, isVerified: user.isVerified },
      accessToken,
      refreshToken,
    };
  }

  async verifyOtp(dto: VerifyOtpDto): Promise<{
    user: { id: string; email: string; firstName: string; lastName: string; isAdmin: boolean; isVerified: boolean };
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

    const [accessToken, refreshToken] = await Promise.all([
      this.generateAccessToken(user.id, user.email, user.isAdmin),
      this.generateRefreshToken(user.id),
    ]);

    return {
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, isAdmin: user.isAdmin, isVerified: true },
      accessToken,
      refreshToken,
    };
  }

  async resendOtp(userId: string): Promise<{ message: string }> {
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
        createdAt: true,
      },
    });
    return user;
  }

  async loginWithGoogle(profile: {
    googleId: string;
    email: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
  }): Promise<{ user: { id: string; email: string; firstName: string; lastName: string; isAdmin: boolean; isVerified: boolean }; accessToken: string; refreshToken: string }> {
    // Find by googleId first, then fall back to email (links existing accounts)
    let user = await this.prisma.user.findFirst({
      where: { OR: [{ googleId: profile.googleId }, { email: profile.email.toLowerCase() }] },
    });

    if (user) {
      // Link googleId if not already set
      if (!user.googleId) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { googleId: profile.googleId, avatarUrl: profile.avatarUrl ?? undefined, isVerified: true },
        });
      }
    } else {
      // New user — auto-verified, no password
      user = await this.prisma.user.create({
        data: {
          email: profile.email.toLowerCase(),
          googleId: profile.googleId,
          avatarUrl: profile.avatarUrl,
          firstName: profile.firstName,
          lastName: profile.lastName,
          isVerified: true,
        },
      });
    }

    const [accessToken, refreshToken] = await Promise.all([
      this.generateAccessToken(user.id, user.email, user.isAdmin),
      this.generateRefreshToken(user.id),
    ]);

    return {
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, isAdmin: user.isAdmin, isVerified: true },
      accessToken,
      refreshToken,
    };
  }

  private async sendOtp(userId: string, email: string, type: 'email_verify'): Promise<void> {
    const code = this.generateOtpCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);

    await this.prisma.otpCode.create({
      data: { userId, codeHash, type, expiresAt },
    });

    await this.emailService.sendOtpEmail(email, code);
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
