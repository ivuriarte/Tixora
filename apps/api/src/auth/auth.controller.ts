import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto, VerifyOtpDto, ResendOtpDto, RefreshTokenDto } from './dto/auth.dto';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '@axon-tickets/types';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('register')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Register a new user' })
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    const ip =
      (req.headers['x-real-ip'] as string | undefined)?.trim() ??
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',').pop()?.trim() ??
      req.ip ??
      '';
    return this.authService.register(dto, ip);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Login with email and password' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Verify email with OTP' })
  async verifyEmail(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Public()
  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @ApiOperation({ summary: 'Resend OTP code' })
  async resendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.resendOtp(dto.userId);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout and revoke refresh token' })
  async logout(@CurrentUser() user: JwtPayload, @Body() dto: RefreshTokenDto) {
    await this.authService.logout(user.sub, dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user' })
  async me(@CurrentUser() user: JwtPayload) {
    return this.authService.getMe(user.sub);
  }

  @Public()
  @Get('google')
  @ApiOperation({ summary: 'Initiate Google OAuth login' })
  googleAuth(@Res() res: Response) {
    const clientId = this.config.get<string>('google.clientId');
    if (!clientId) {
      (res as any).status(503).json({ message: 'Google login is not configured yet.' });
      return;
    }
    // Passport handles the redirect
    (res as any).redirect(
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      new URLSearchParams({
        client_id: clientId,
        redirect_uri: this.config.get<string>('google.callbackUrl') ?? '',
        response_type: 'code',
        scope: 'email profile',
        access_type: 'offline',
        prompt: 'select_account',
      }).toString(),
    );
  }

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth callback' })
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const profile = req.user as {
      googleId: string;
      email: string;
      firstName: string;
      lastName: string;
      avatarUrl: string | null;
    };

    const { user, accessToken, refreshToken } = await this.authService.loginWithGoogle(profile);
    const webUrl = (req as any).app?.get?.('webUrl') as string | undefined;
    const base = this.config.get<string>('webUrl') ?? webUrl ?? 'http://localhost:3000';

    const params = new URLSearchParams({
      accessToken,
      refreshToken,
      firstName: user.firstName,
      isAdmin: String(user.isAdmin),
    });

    res.redirect(`${base}/auth/callback?${params.toString()}`);
  }
}
