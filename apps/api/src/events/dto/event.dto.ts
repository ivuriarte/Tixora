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
  IsBoolean,
  IsUrl,
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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  landmark?: string;

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

  @ApiProperty({ required: false, description: 'Maximum total number of attendees for this event' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxCapacity?: number;

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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  imageUrl?: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  allowManualPayment?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  bankAccountNumber?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankAccountName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  gcashNumber?: string;

  @ApiProperty({ required: false, description: 'Array of payment method objects (bank/ewallet)' })
  @IsOptional()
  paymentMethods?: Array<{
    type: 'bank' | 'ewallet';
    name?: string;
    accountName?: string;
    accountNumber?: string;
    qrImageUrl?: string;
  }>;
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
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  landmark?: string;

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
  @IsInt()
  @Min(1)
  maxCapacity?: number;

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

  @IsOptional()
  @IsBoolean()
  allowManualPayment?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  bankAccountNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankAccountName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  gcashNumber?: string;

  @IsOptional()
  paymentMethods?: Array<{
    type: 'bank' | 'ewallet';
    name?: string;
    accountName?: string;
    accountNumber?: string;
    qrImageUrl?: string;
  }>;
}
