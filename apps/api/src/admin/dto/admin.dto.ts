import {
  IsString,
  MinLength,
  MaxLength,
  IsArray,
  ArrayMaxSize,
  ArrayMinSize,
  IsUUID,
  IsBoolean,
  IsNumber,
  Min,
  Max,
  IsEmail,
  IsDateString,
  IsIn,
  IsOptional,
  ValidateIf,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RejectOrganizerDto {
  @ApiProperty({ description: 'Reason for rejection shown to the organizer (5-500 chars)' })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;
}

export class CheckinDto {
  @ApiProperty({ description: 'Raw QR token scanned from ticket' })
  @IsString()
  qrToken: string;

  @ApiProperty({ description: 'Event selected by the check-in staff' })
  @IsUUID()
  eventId: string;
}

export class WalkInRegistrationDto {
  @ApiProperty({ description: 'Ticket tier to register the walk-in attendee under' })
  @IsUUID()
  tierId: string;

  @ApiProperty({ description: 'Attendee first name' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ description: 'Attendee last name' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @ApiProperty({ description: 'Attendee email address' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Attendee contact number' })
  @IsString()
  @MinLength(7)
  @MaxLength(20)
  contactNumber: string;

  @ApiProperty({ description: 'Attendee gender' })
  @IsIn(['female', 'male', 'non_binary', 'prefer_not_to_say', 'self_described'])
  gender: string;

  @ApiProperty({ description: 'Attendee birthday as YYYY-MM-DD' })
  @IsDateString()
  birthday: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== undefined && value !== null && value !== '')
  @IsString()
  @MaxLength(150)
  company?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== undefined && value !== null && value !== '')
  @IsString()
  @MaxLength(150)
  jobTitle?: string;
}

export class RejectRegistrationDto {
  @ApiProperty({ description: 'Reason for rejection (visible to user)' })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;
}

export class BulkApproveDto {
  @ApiProperty({ description: 'Registration ids to approve (max 20)', type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  ids: string[];
}

export class SetUserRoleDto {
  @ApiProperty({ description: 'true to grant admin, false to revoke' })
  @IsBoolean()
  isAdmin: boolean;
}

export class BulkRejectDto {
  @ApiProperty({ description: 'Registration ids to reject (max 20)', type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  ids: string[];

  @ApiProperty({ description: 'Shared rejection reason (5-500 chars, visible to users)' })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;
}

export class UpdatePlatformSettingsDto {
  @ApiProperty({ description: 'Flat service fee per order in pesos (₱). Min ₱0, max ₱9999.' })
  @IsNumber()
  @Min(0)
  @Max(9999)
  serviceFee: number;
}
