import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateReferralCodeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsString()
  @Matches(/^[A-Z0-9_-]{3,32}$/i, {
    message: 'Code must be 3–32 letters, numbers, hyphens, or underscores',
  })
  code!: string;

  @IsIn(['percentage', 'fixed_amount'])
  discountType!: 'percentage' | 'fixed_amount';

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10_000_000)
  discountValue!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  maxUses?: number;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  applicableTierIds?: string[];
}

export class UpdateReferralCodeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  maxUses?: number | null;

  @IsOptional()
  @IsDateString()
  validFrom?: string | null;

  @IsOptional()
  @IsDateString()
  validUntil?: string | null;
}

export class SetReferralCodeStatusDto {
  @IsBoolean()
  isActive!: boolean;
}

export class ValidateReferralCodeDto {
  @IsUUID()
  eventId!: string;

  @IsUUID()
  tierId!: string;

  @IsString()
  @MaxLength(32)
  code!: string;

  @IsInt()
  @Min(1)
  @Max(10)
  attendeeCount!: number;
}
