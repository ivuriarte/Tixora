import { IsEmail, IsOptional, IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Philippine mobile regex: +639XXXXXXXXX (13 chars total)
const PH_PHONE_RE = /^(\+639\d{9})?$/;

export class LoginDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  email: string;

  @ApiProperty()
  @IsString()
  password: string;
}

export class VerifyOtpDto {
  @ApiProperty()
  @IsString()
  @MaxLength(36)
  userId: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  @Matches(/^\d{6}$/, { message: 'OTP must be exactly 6 digits' })
  otp: string;
}

export class ResendOtpDto {
  @ApiProperty()
  @IsString()
  @MaxLength(36)
  userId: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;
}

export class RequestAccessDto {
  @ApiProperty({ example: 'juan@example.com' })
  @IsEmail()
  @Transform(({ value }: { value: string }) => value?.toLowerCase().trim())
  email: string;

  /** When provided during registration wizard, we pre-fill the stub user's profile
   *  so that verifyAccess() returns isNewUser=false and skips the profile step. */
  @ApiPropertyOptional({ example: 'Juan' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  firstName?: string;

  @ApiPropertyOptional({ example: 'dela Cruz' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  lastName?: string;

  @ApiPropertyOptional({ example: '+639171234567' })
  @IsOptional()
  @IsString()
  @Matches(PH_PHONE_RE, { message: 'Phone must be in format +639XXXXXXXXX' })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(36)
  eventId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  eventSlug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  eventName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sessionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  returnUrl?: string;
}

export class VerifyAccessDto {
  @ApiProperty()
  @IsString()
  @MaxLength(36)
  userId: string;

  @ApiProperty({ example: '123456', description: 'Six-digit OTP' })
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  @Matches(/^\d{6}$/, { message: 'OTP must be exactly 6 digits' })
  otp: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(36)
  eventId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  eventSlug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  eventName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sessionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  returnUrl?: string;
}
