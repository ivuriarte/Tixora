import { IsString, MinLength, MaxLength, IsArray, ArrayMaxSize, ArrayMinSize, IsUUID, IsBoolean, IsNumber, Min, Max } from 'class-validator';
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
