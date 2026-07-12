import {
  IsString,
  IsEmail,
  IsOptional,
  IsUUID,
  IsArray,
  IsDateString,
  IsIn,
  ValidateIf,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AttendeeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @IsEmail()
  email!: string;

  /** Mobile number is required for event contact and gate verification purposes.
   *  Accepts Philippine format (+639XXXXXXXXX) or international format (+XXXXXXXXXXX). */
  @IsString()
  @MinLength(7)
  @MaxLength(20)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  jobTitle?: string;

  @ValidateIf((_, value) => value !== undefined && value !== null && value !== '')
  @IsDateString()
  birthday?: string;

  @ValidateIf((_, value) => value !== undefined && value !== null && value !== '')
  @IsIn(['female', 'male', 'non_binary', 'prefer_not_to_say', 'self_described'])
  gender?: string;

  @ValidateIf((_, value) => value !== undefined && value !== null && value !== '')
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  city?: string;
}

export class CreateRegistrationDto {
  @IsUUID()
  eventId!: string;

  @IsUUID()
  tierId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @Type(() => AttendeeDto)
  attendees!: AttendeeDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
