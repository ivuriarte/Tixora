import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { FUNNEL_STATUSES, FUNNEL_STEPS } from '../funnel.constants';

export class CreateFunnelEventDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  eventId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(320)
  email?: string;

  @ApiProperty({ enum: FUNNEL_STEPS })
  @IsString()
  @IsIn(FUNNEL_STEPS)
  step!: string;

  @ApiProperty({ enum: FUNNEL_STATUSES })
  @IsString()
  @IsIn(FUNNEL_STATUSES)
  status!: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
