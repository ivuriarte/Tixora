import {
  IsString,
  MinLength,
  MaxLength,
  IsArray,
  ArrayMaxSize,
  ArrayMinSize,
  IsUUID,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  Min,
  Max,
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

export class AddOrganizerMemberDto {
  @ApiProperty({ description: 'Email address to grant organizer access to' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Organizer member role', enum: ['co_owner', 'manager', 'member'], default: 'member', required: false })
  @IsOptional()
  @IsIn(['co_owner', 'manager', 'member'])
  role?: 'co_owner' | 'manager' | 'member';
}

export class UpdateOrganizerMemberDto {
  @ApiProperty({ description: 'Organizer member role', enum: ['co_owner', 'manager', 'member'] })
  @IsIn(['co_owner', 'manager', 'member'])
  role: 'co_owner' | 'manager' | 'member';
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
  @ApiProperty({ description: 'Flat processing fee per transaction in pesos (₱). Min ₱0, max ₱9999.' })
  @IsNumber()
  @Min(0)
  @Max(9999)
  serviceFee: number;
}

export class ReassignRaceDistanceDto {
  @ApiProperty({ description: 'Configured destination race distance' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  distance: string;

  @ApiProperty({ description: 'Required audit reason (5-500 chars)' })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;
}

export class SetOrganizerProfileVisibilityDto {
  @IsBoolean()
  visible: boolean;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;
}
