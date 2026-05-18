import { IsString, MinLength, IsArray, ArrayMaxSize, ArrayMinSize, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CheckinDto {
  @ApiProperty({ description: 'Raw QR token scanned from ticket' })
  @IsString()
  qrToken: string;
}

export class RejectRegistrationDto {
  @ApiProperty({ description: 'Reason for rejection (visible to user)' })
  @IsString()
  @MinLength(5)
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
