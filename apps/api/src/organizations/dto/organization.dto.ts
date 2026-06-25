import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  IsUrl,
  IsIn,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const ID_TYPES = ['passport', 'drivers_license', 'umid', 'sss', 'philsys', 'postal_id'] as const;
const ORG_TYPES = ['individual', 'company', 'ngo', 'event_company'] as const;

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
  registrationNumber?: string;

  @ApiPropertyOptional({ example: 'https://acme.com' })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(200)
  website?: string;

  @ApiPropertyOptional({ example: 'https://facebook.com/acmeevents' })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(200)
  facebookUrl?: string;
}
