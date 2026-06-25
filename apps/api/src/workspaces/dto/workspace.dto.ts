import {
  IsString,
  IsOptional,
  IsBoolean,
  IsISO8601,
  MaxLength,
  IsIn,
  MinLength,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const VALID_STATUSES = ['open', 'in_progress', 'done', 'blocked', 'not_applicable'] as const;
const VALID_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
const VALID_MILESTONE_STATUSES = ['upcoming', 'at_risk', 'done', 'overdue'] as const;

export class UpdateWorkspaceItemDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @ApiProperty({ required: false, enum: VALID_STATUSES })
  @IsOptional()
  @IsIn(VALID_STATUSES)
  status?: string;

  @ApiProperty({ required: false, enum: VALID_PRIORITIES })
  @IsOptional()
  @IsIn(VALID_PRIORITIES)
  priority?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isBlocker?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @ValidateIf((o) => o.dueDate !== null)
  @IsISO8601()
  dueDate?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;

  @ApiProperty({ required: false, description: 'User ID (UUID) responsible for this item, or null to unassign' })
  @IsOptional()
  @ValidateIf((o) => o.assignedToId !== null)
  @IsUUID()
  assignedToId?: string | null;

  @ApiProperty({ required: false, description: 'User ID (UUID) accountable for this item, or null to unassign' })
  @IsOptional()
  @ValidateIf((o) => o.accountableId !== null)
  @IsUUID()
  accountableId?: string | null;
}

export class CreateWorkspaceItemDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @ApiProperty({ required: false, enum: VALID_PRIORITIES })
  @IsOptional()
  @IsIn(VALID_PRIORITIES)
  priority?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isBlocker?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class ApplyTemplateDto {
  @ApiProperty()
  @IsString()
  @MaxLength(50)
  templateId: string;
}

export class CreateMilestoneDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @ApiProperty()
  @IsISO8601()
  dueDate: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateMilestoneDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @ApiProperty({ required: false, enum: VALID_MILESTONE_STATUSES })
  @IsOptional()
  @IsIn(VALID_MILESTONE_STATUSES)
  status?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
