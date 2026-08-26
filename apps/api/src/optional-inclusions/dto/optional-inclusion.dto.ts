import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class InclusionTierEligibilityInputDto {
  @IsUUID()
  tierId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxQuantityPerRegistration?: number;
}

export class InclusionVariantInputDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sku?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @IsInt()
  @Min(0)
  @Max(1_000_000)
  totalStock!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateEventInclusionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  description?: string;

  @IsOptional()
  @IsIn(['draft', 'active', 'archived'])
  status?: 'draft' | 'active' | 'archived';

  @IsOptional()
  @IsDateString()
  saleStartsAt?: string;

  @IsOptional()
  @IsDateString()
  saleEndsAt?: string;

  @IsOptional()
  @IsIn(['pickup', 'delivery', 'digital', 'manual'])
  fulfillmentMethod?: 'pickup' | 'delivery' | 'digital' | 'manual';

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  fulfillmentInstructions?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(100)
  eligibleTierIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => InclusionTierEligibilityInputDto)
  tierEligibility?: InclusionTierEligibilityInputDto[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => InclusionVariantInputDto)
  variants?: InclusionVariantInputDto[];
}

export class UpdateEventInclusionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  description?: string;

  @IsOptional()
  @IsIn(['draft', 'active', 'archived'])
  status?: 'draft' | 'active' | 'archived';

  @IsOptional()
  @IsDateString()
  saleStartsAt?: string;

  @IsOptional()
  @IsDateString()
  saleEndsAt?: string;

  @IsOptional()
  @IsIn(['pickup', 'delivery', 'digital', 'manual'])
  fulfillmentMethod?: 'pickup' | 'delivery' | 'digital' | 'manual';

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  fulfillmentInstructions?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(100)
  eligibleTierIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => InclusionTierEligibilityInputDto)
  tierEligibility?: InclusionTierEligibilityInputDto[];
}

export class UpdateInclusionVariantDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sku?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class InclusionSelectionDto {
  @IsUUID()
  inclusionId!: string;

  @IsUUID()
  variantId!: string;

  @IsInt()
  @Min(1)
  @Max(100)
  quantity!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(99)
  attendeeIndex?: number;
}

export class CreateInclusionQuoteDto {
  @IsUUID()
  tierId!: string;

  @IsInt()
  @Min(1)
  @Max(10)
  attendeeCount!: number;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => InclusionSelectionDto)
  selections!: InclusionSelectionDto[];

  @IsOptional()
  @IsString()
  @MaxLength(32)
  referralCode?: string;
}

export class AdjustInclusionStockDto {
  @IsInt()
  @Min(-1_000_000)
  @Max(1_000_000)
  quantityDelta!: number;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}

export class FulfillInclusionDto {
  @IsInt()
  @Min(1)
  @Max(1_000)
  quantity!: number;
}

export class ReverseFulfillmentDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}

export class SetOptionalInclusionsEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}
