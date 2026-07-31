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
  IsInt,
  Min,
  IsBoolean,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export class DeliveryAddressDto {
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  line1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  line2?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  city!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  province!: string;

  @IsString()
  @Matches(/^[0-9A-Za-z -]{3,12}$/)
  postalCode!: string;
}

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

  /** Optional contact number. Guest checkout deliberately requires only name and email. */
  @IsOptional()
  @IsString()
  @MinLength(7)
  @MaxLength(20)
  phone?: string;

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

  @IsOptional()
  @IsString()
  @MaxLength(80)
  raceDistance?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  raceDivision?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  genderIdentity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  @MinLength(7)
  @MaxLength(20)
  emergencyContactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  emergencyContactRelationship?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  merchandiseSize?: string;

  @IsOptional()
  @IsIn(['self_claim', 'delivery'])
  claimMethod?: 'self_claim' | 'delivery';

  @IsOptional()
  @ValidateNested()
  @Type(() => DeliveryAddressDto)
  deliveryAddress?: DeliveryAddressDto;
}

export class CreateRegistrationDto {
  @IsUUID()
  eventId!: string;

  @IsUUID()
  tierId!: string;

  @IsOptional()
  @IsEmail()
  guestEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  subEventId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  subEventIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @Type(() => AttendeeDto)
  attendees?: AttendeeDto[];

  @ValidateIf((dto: CreateRegistrationDto) => !dto.attendees?.length)
  @IsInt()
  @Min(1)
  attendeeCount?: number;

  @IsOptional()
  @IsBoolean()
  accountConsent?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  referralCode?: string;
}
