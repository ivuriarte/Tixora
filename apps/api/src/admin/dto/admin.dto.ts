import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CheckinDto {
  @ApiProperty({ description: 'Raw QR token scanned from ticket' })
  @IsString()
  qrToken: string;
}
