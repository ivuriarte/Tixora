import { IsEmail, IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { UpdateRegistrationAttendeesDto } from './update-registration-attendees.dto';

export class RequestGuestCheckoutCodeDto {
  @IsEmail()
  @Transform(({ value }: { value: string }) => value?.toLowerCase().trim())
  email!: string;
}

export class ConfirmGuestCheckoutDto extends UpdateRegistrationAttendeesDto {
  @IsEmail()
  @Transform(({ value }: { value: string }) => value?.toLowerCase().trim())
  email!: string;

  @IsString()
  @MaxLength(6)
  @Matches(/^\d{6}$/, { message: 'OTP must be exactly 6 digits' })
  otp!: string;
}

export class ClaimRegistrationDto extends UpdateRegistrationAttendeesDto {}
