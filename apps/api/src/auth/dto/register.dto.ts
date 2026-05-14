import { IsEmail, IsString, MinLength, MaxLength, IsOptional, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'juan@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @ApiProperty({ example: 'Juan' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  firstName: string;

  @ApiProperty({ example: 'Dela Cruz' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  lastName: string;

  @ApiProperty({ required: false, example: '+639171234567' })
  @IsOptional()
  @IsString()
  @Matches(/^\+639\d{9}$/, { message: 'Phone must be in format +639XXXXXXXXX' })
  phone?: string;

  @ApiProperty({ description: 'hCaptcha response token' })
  @IsString()
  captchaToken: string;
}
