import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { Resend } from 'resend';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto, VerifyOtpDto } from './dto/auth.dto';
import { JwtPayload } from '@tixora/types';

const BCRYPT_COST = 12;
const OTP_TTL_SECONDS = 300; // 5 minutes
const OTP_DIGITS = 6;
const MAX_ACTIVE_RESERVATIONS = 3;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly resend: Resend;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    this.resend = new Resend(this.config.get<string>('resend.apiKey'));
  }

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
      },
    });

    await this.sendOtp(user.id, user.email, 'email_verify');

    return { userId: user.id, message: 'Check your email for a verification code.' };
  }

  async login(dto: LoginDto): Promise<{ userId: string; isVerified: boolean; accessToken?: string; message?: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const match = await bcrypt.compare(dto.password, user.passwordHash);
    if (!match) throw new UnauthorizedException('Invalid email or password');

    if (!user.isVerified) {
      // Re-send OTP and return userId so frontend can show verify screen
      await this.sendOtp(user.id, user.email, 'email_verify');
      return { userId: user.id, isVerified: false, message: 'Please verify your email first.' };
    }

    const accessToken = await this.generateAccessToken(user.id, user.email, user.isAdmin);
    const refreshToken = await this.generateRefreshToken(user.id);

    return { userId: user.id, isVerified: true, accessToken };
  }

  async verifyOtp(dto: VerifyOtpDto): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new BadRequestException('Invalid request');

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
    if (!match) throw new BadRequestException('Incorrect verification code');

    // Mark OTP as used and verify user atomically
    await this.prisma.$transaction([
      this.prisma.otpCode.update({ where: { id: otpRecord.id }, data: { used: true } }),
      this.prisma.user.update({ where: { id: dto.userId }, data: { isVerified: true } }),
    ]);

    const accessToken = await this.generateAccessToken(user.id, user.email, user.isAdmin);
    const refreshToken = await this.generateRefreshToken(user.id);

    return { accessToken, refreshToken };
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
    const { sub: userId, jti } = this.jwt.verify<{ sub: string; jti: string }>(refreshToken, {
      algorithms: ['RS256'],
    });

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

  private async sendOtp(userId: string, email: string, type: 'email_verify'): Promise<void> {
    const code = this.generateOtpCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);

    await this.prisma.otpCode.create({
      data: { userId, codeHash, type, expiresAt },
    });

    const fromName = this.config.get<string>('resend.fromName') ?? 'Tixora';
    const fromEmail = this.config.get<string>('resend.fromEmail') ?? '';

    const { error } = await this.resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: email,
      subject: 'Your Tixora verification code',
      html: `
        <div style="font-family:sans-serif;max-width:400px;margin:0 auto">
          <h2>Verify your email</h2>
          <p>Your verification code is:</p>
          <p style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#7c3aed">${code}</p>
          <p>This code expires in 5 minutes. Do not share it with anyone.</p>
        </div>
      `,
    });

    if (error) {
      this.logger.warn({ msg: 'Failed to send OTP email', userId, error: error.message });
    }
  }

  private generateOtpCode(): string {
    const digits = Math.floor(Math.random() * 10 ** OTP_DIGITS)
      .toString()
      .padStart(OTP_DIGITS, '0');
    return digits;
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
