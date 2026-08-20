import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  IsIn,
  Matches,
  IsBoolean,
  ValidateNested,
  IsEmail,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

const ID_TYPES = ['passport', 'drivers_license', 'umid', 'sss', 'philsys', 'postal_id'] as const;
const ORG_TYPES = ['individual', 'company', 'ngo', 'event_company'] as const;

export class OrganizationSocialLinksDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^https:\/\/(www\.)?instagram\.com\//i, {
    message: 'Instagram URL must be a valid HTTPS instagram.com link',
  })
  @MaxLength(300)
  instagram?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^https:\/\/(www\.)?linkedin\.com\//i, {
    message: 'LinkedIn URL must be a valid HTTPS linkedin.com link',
  })
  @MaxLength(300)
  linkedin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^https:\/\/(www\.)?(x\.com|twitter\.com)\//i, {
    message: 'X URL must be a valid HTTPS x.com or twitter.com link',
  })
  @MaxLength(300)
  x?: string;
}

export class RegisterOrganizationDto {
  @ApiProperty({ example: 'Acme Events Inc.' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'We produce live music and corporate events across the Philippines.' })
  @IsString()
  @MinLength(20, { message: 'Description must be at least 20 characters' })
  @MaxLength(1000)
  description: string;

  @ApiProperty({ example: 'Juan Dela Cruz' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  contactName: string;

  @ApiProperty({ example: '+639171234567' })
  @IsString()
  @Matches(/^\+?[0-9\s\-().]{7,25}$/, { message: 'Enter a valid phone number' })
  phone: string;

  @ApiProperty({ example: 'Manila' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  city: string;

  @ApiProperty({ enum: ID_TYPES, example: 'passport' })
  @IsIn(ID_TYPES, { message: 'Select a valid government ID type' })
  idType: string;

  @ApiProperty({ example: 'P1234567A' })
  @IsString()
  @MinLength(4)
  @MaxLength(50)
  idNumber: string;

  @ApiProperty({ enum: ORG_TYPES, example: 'company' })
  @IsIn(ORG_TYPES, { message: 'Select a valid organization type' })
  organizationType: string;

  @ApiPropertyOptional({ example: 'DTI-123456' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  registrationNumber?: string | null;

  @ApiPropertyOptional({ example: 'https://acme.com' })
  @IsOptional()
  @Matches(/^https:\/\//i, { message: 'Website must use HTTPS' })
  @MaxLength(200)
  website?: string | null;

  @ApiPropertyOptional({ example: 'https://facebook.com/acmeevents' })
  @IsOptional()
  @Matches(/^https:\/\/(www\.)?facebook\.com\//i, {
    message: 'Facebook URL must be a valid HTTPS facebook.com link',
  })
  @MaxLength(200)
  facebookUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^https:\/\//i, { message: 'Logo URL must use HTTPS' })
  @MaxLength(500)
  logoUrl?: string | null;

  @ApiPropertyOptional({ type: OrganizationSocialLinksDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => OrganizationSocialLinksDto)
  socialLinks?: OrganizationSocialLinksDto;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class UpdateOrganizationDto {
  @ApiPropertyOptional({ example: 'Acme Events Inc.' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'We produce live music and corporate events across the Philippines.' })
  @IsOptional()
  @IsString()
  @MinLength(20, { message: 'Description must be at least 20 characters' })
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: 'Juan Dela Cruz' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  contactName?: string;

  @ApiPropertyOptional({ example: '+639171234567' })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9\s\-().]{7,25}$/, { message: 'Enter a valid phone number' })
  phone?: string;

  @ApiPropertyOptional({ example: 'Manila' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  city?: string;

  @ApiPropertyOptional({ enum: ID_TYPES, example: 'passport' })
  @IsOptional()
  @IsIn(ID_TYPES, { message: 'Select a valid government ID type' })
  idType?: string;

  @ApiPropertyOptional({ example: 'P1234567A' })
  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(50)
  idNumber?: string;

  @ApiPropertyOptional({ enum: ORG_TYPES, example: 'company' })
  @IsOptional()
  @IsIn(ORG_TYPES, { message: 'Select a valid organization type' })
  organizationType?: string;

  @ApiPropertyOptional({ example: 'DTI-123456' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  registrationNumber?: string | null;

  @ApiPropertyOptional({ example: 'https://acme.com' })
  @IsOptional()
  @Matches(/^https:\/\//i, { message: 'Website must use HTTPS' })
  @MaxLength(200)
  website?: string | null;

  @ApiPropertyOptional({ example: 'https://facebook.com/acmeevents' })
  @IsOptional()
  @Matches(/^https:\/\/(www\.)?facebook\.com\//i, {
    message: 'Facebook URL must be a valid HTTPS facebook.com link',
  })
  @MaxLength(200)
  facebookUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^https:\/\//i, { message: 'Logo URL must use HTTPS' })
  @MaxLength(500)
  logoUrl?: string | null;

  @ApiPropertyOptional({ type: OrganizationSocialLinksDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => OrganizationSocialLinksDto)
  socialLinks?: OrganizationSocialLinksDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class AddOrganizationMemberDto {
  @ApiProperty({ example: 'teammate@example.com' })
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiPropertyOptional({ enum: ['admin', 'member'], default: 'member' })
  @IsOptional()
  @IsIn(['admin', 'member'])
  role?: 'admin' | 'member';
}

export class UpdateOrganizationMemberDto {
  @ApiProperty({ enum: ['admin', 'member'] })
  @IsIn(['admin', 'member'])
  role: 'admin' | 'member';
}
