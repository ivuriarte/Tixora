import {
  IsString,
  IsOptional,
  IsDateString,
  IsInt,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateEventDto {
  @ApiProperty({ example: 'Coldplay Manila 2025' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ example: 'SM Mall of Asia Arena' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  venue: string;

  @ApiProperty({ required: false, default: 'Manila' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiProperty({ example: '2025-10-15T20:00:00+08:00' })
  @IsDateString()
  startsAt: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiProperty({ required: false, default: 4 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxPerUser?: number;
}

export class UpdateEventDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  venue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxPerUser?: number;

  @IsOptional()
  @IsString()
  status?: string;
}
