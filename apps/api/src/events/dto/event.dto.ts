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
  IsArray,
  ValidateNested,
  ValidateIf,
  IsIn,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

// ─── Nested item DTOs ────────────────────────────────────────────────────
// These are required so class-transformer (with enableImplicitConversion)
// preserves the object shape of array items. Without @Type(), reflected
// metadata for `Array<{...}>` is just `Array`, and implicit conversion
// turns each item into `Object.assign(new Array(), item)`, which serializes
// to `[]` (data loss).

export class AgendaItemDto {
  @ApiProperty({ required: false, description: 'Stable agenda item id used for sub-event registration selections' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  id?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  time?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ required: false, default: false, description: 'When true, attendees can choose this agenda item during registration.' })
  @IsOptional()
  @IsBoolean()
  isSubEvent?: boolean;
}

export class SponsorItemDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Matches(/^https:\/\//i, { message: 'Logo URL must use HTTPS' })
  @MaxLength(500)
  logoUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  tier?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Matches(/^https:\/\//i, { message: 'Website URL must use HTTPS' })
  @MaxLength(500)
  websiteUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;
}

export class CustomSectionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  description!: string;

  @IsOptional()
  @ValidateIf((_section: CustomSectionDto, value: unknown) => value !== '')
  @Matches(/^https:\/\//i, { message: 'Image URL must use HTTPS' })
  @MaxLength(500)
  imageUrl?: string;

  @ValidateIf((section: CustomSectionDto) => Boolean(section.imageUrl))
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  imageAlt?: string;

  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;
}

export class FaqItemDto {
  @ApiProperty()
  @IsString()
  @MaxLength(500)
  question: string;

  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  answer: string;
}

export class PaymentMethodItemDto {
  @ApiProperty({ enum: ['bank', 'ewallet'] })
  @IsIn(['bank', 'ewallet'])
  type: 'bank' | 'ewallet';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  accountName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  accountNumber?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  qrImageUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  instructions?: string;
}

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

  @ApiProperty({ required: false, description: 'Latitude for map pin (e.g. 7.0644)' })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiProperty({ required: false, description: 'Longitude for map pin (e.g. 125.6078)' })
  @IsOptional()
  @IsNumber()
  longitude?: number;

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

  @ApiProperty({ required: false, type: [AgendaItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgendaItemDto)
  agenda?: AgendaItemDto[];

  @ApiProperty({ required: false, type: [SponsorItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SponsorItemDto)
  sponsors?: SponsorItemDto[];

  @ApiProperty({ required: false, type: [FaqItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FaqItemDto)
  faqs?: FaqItemDto[];

  @ApiProperty({ required: false, type: [CustomSectionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomSectionDto)
  customSections?: CustomSectionDto[];

  @ApiProperty({ required: false, default: 50, description: 'Flat platform fee per registration transaction in PHP' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  platformFee?: number;

  @ApiProperty({ required: false, default: false, description: 'Marks the event as free and suppresses platform fees at registration.' })
  @IsOptional()
  @IsBoolean()
  isFree?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  imageUrl?: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  allowManualPayment?: boolean;

  @ApiProperty({ required: false, default: false, description: 'Allow public QR-initiated on-site registration and daily attendance check-in.' })
  @IsOptional()
  @IsBoolean()
  onsiteRegistrationEnabled?: boolean;

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

  @ApiProperty({ required: false, type: [PaymentMethodItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentMethodItemDto)
  paymentMethods?: PaymentMethodItemDto[];

  // ── Featured hero fields ────────────────────────────────────────────────
  @ApiProperty({ required: false, example: 'FULL-DAY LEADERSHIP CONFERENCE', description: 'Badge text shown above the event title in the homepage hero' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  tagline?: string;

  @ApiProperty({ required: false, default: false, description: 'Pin this event as a featured hero on the homepage' })
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiProperty({ required: false, description: '1 = first hero slot; null = unordered' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  featuredOrder?: number;

  @ApiProperty({ required: false, description: 'ISO date after which the event is automatically removed from the featured hero' })
  @IsOptional()
  @IsDateString()
  featuredUntil?: string;
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
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

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
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgendaItemDto)
  agenda?: AgendaItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SponsorItemDto)
  sponsors?: SponsorItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FaqItemDto)
  faqs?: FaqItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomSectionDto)
  customSections?: CustomSectionDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  platformFee?: number;

  @IsOptional()
  @IsBoolean()
  isFree?: boolean;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  allowManualPayment?: boolean;

  @IsOptional()
  @IsBoolean()
  onsiteRegistrationEnabled?: boolean;

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
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentMethodItemDto)
  paymentMethods?: PaymentMethodItemDto[];

  // ── Featured hero fields ────────────────────────────────────────────────
  @IsOptional()
  @IsString()
  @MaxLength(100)
  tagline?: string;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  featuredOrder?: number;

  @IsOptional()
  @IsDateString()
  featuredUntil?: string;
}

export class OnsiteRegistrationDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  eventId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  attendeeId?: string;

  @IsOptional()
  @IsBoolean()
  emailNotApplicable?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  tierId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  subEventId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  subEventIds?: string[];

  @ValidateIf((dto: OnsiteRegistrationDto) => !dto.attendeeId)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @ValidateIf((dto: OnsiteRegistrationDto) => !dto.attendeeId)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @ValidateIf((dto: OnsiteRegistrationDto) => !dto.attendeeId && !dto.emailNotApplicable)
  @Matches(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
  email?: string;

  @ValidateIf((dto: OnsiteRegistrationDto) => !dto.attendeeId)
  @IsString()
  @MinLength(7)
  @MaxLength(20)
  contactNumber?: string;

  @ValidateIf((dto: OnsiteRegistrationDto) => !dto.attendeeId)
  @IsIn(['female', 'male', 'non_binary', 'prefer_not_to_say', 'self_described'])
  gender?: string;

  @ValidateIf((dto: OnsiteRegistrationDto) => !dto.attendeeId)
  @IsDateString()
  birthday?: string;

  @ValidateIf((dto: OnsiteRegistrationDto) => !dto.attendeeId)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  jobTitle?: string;
}

export class OnsiteProfileSuggestionDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  eventId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;
}
