import {
  IsString,
  IsOptional,
  IsDateString,
  IsInt,
  Min,
  Max,
  MinLength,
  MaxLength,
  IsNumber,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateEventDto {
  @ApiProperty({ example: 'Francis Kong: Build to Lead' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ example: 'SMX Convention Center Davao' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  venue: string;

  @ApiProperty({ required: false, default: 'Manila' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiProperty({ example: '2026-08-15T08:00:00+08:00' })
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

  // Conference-specific fields (Francis Kong MVP)
  @ApiProperty({ required: false, example: 'Francis Kong' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  speakerName?: string;

  @ApiProperty({ required: false, description: 'Array of { time, title, description? }' })
  @IsOptional()
  agenda?: Array<{ time: string; title: string; description?: string }>;

  @ApiProperty({ required: false, description: 'Array of { name, logoUrl?, tier? }' })
  @IsOptional()
  sponsors?: Array<{ name: string; logoUrl?: string; tier?: string }>;

  @ApiProperty({ required: false, description: 'Array of { question, answer }' })
  @IsOptional()
  faqs?: Array<{ question: string; answer: string }>;

  @ApiProperty({ required: false, default: 50, description: 'Platform fee per ticket in PHP' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  platformFee?: number;
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

  @IsOptional()
  @IsString()
  @MaxLength(200)
  speakerName?: string;

  @IsOptional()
  agenda?: Array<{ time: string; title: string; description?: string }>;

  @IsOptional()
  sponsors?: Array<{ name: string; logoUrl?: string; tier?: string }>;

  @IsOptional()
  faqs?: Array<{ question: string; answer: string }>;

  @IsOptional()
  @IsNumber()
  @Min(0)
  platformFee?: number;

  @IsOptional()
  @IsString()
  imageUrl?: string;
}
