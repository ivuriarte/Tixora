import {
  IsString,
  IsEmail,
  IsOptional,
  IsUUID,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AttendeeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  jobTitle?: string;
}

export class CreateRegistrationDto {
  @IsUUID()
  eventId!: string;

  @IsUUID()
  tierId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @Type(() => AttendeeDto)
  attendees!: AttendeeDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
