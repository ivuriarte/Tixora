import {
  IsString,
  IsOptional,
  IsNumber,
  IsInt,
  Min,
  Max,
  IsDateString,
  IsBoolean,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTierDto {
  @ApiProperty({ example: 'General Admission' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ example: 1500 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @ApiProperty({ example: 500 })
  @IsInt()
  @Min(1)
  totalQuantity: number;

  @ApiProperty({ required: false, default: 4 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxPerOrder?: number;

  @IsOptional()
  @IsDateString()
  saleStartsAt?: string;

  @IsOptional()
  @IsDateString()
  saleEndsAt?: string;

  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateTierDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  totalQuantity?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxPerOrder?: number;

  @IsOptional()
  @IsDateString()
  saleStartsAt?: string;

  @IsOptional()
  @IsDateString()
  saleEndsAt?: string;

  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
