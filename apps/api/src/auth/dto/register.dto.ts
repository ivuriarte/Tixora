import { IsDateString, IsEmail, IsIn, IsString, MinLength, MaxLength, IsOptional, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'juan@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({
    minLength: 8,
    description:
      'Min 8 chars, must contain at least one uppercase letter, one lowercase letter, and one digit.',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, and one digit',
  })
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

  @ApiProperty({ example: '+639171234567' })
  @IsString()
  @Matches(/^\+639\d{9}$/, { message: 'Phone must be in format +639XXXXXXXXX' })
  phone: string;

  // Conference registration fields (Francis Kong MVP)
  @ApiProperty({ required: false, example: 'Acme Corp' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  company?: string;

  @ApiProperty({ required: false, example: 'General Manager' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  jobTitle?: string;

  @ApiProperty({ example: 'Davao City' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  city: string;

  @ApiProperty({ example: '1990-05-21' })
  @IsDateString()
  birthday: string;

  @ApiProperty({ enum: ['female', 'male', 'non_binary', 'prefer_not_to_say', 'self_described'] })
  @IsIn(['female', 'male', 'non_binary', 'prefer_not_to_say', 'self_described'])
  gender: string;

  @ApiProperty({ description: 'hCaptcha response token' })
  @IsString()
  captchaToken: string;
}
