import {
  IsString,
  IsOptional,
  IsBoolean,
  IsISO8601,
  MaxLength,
  IsIn,
  MinLength,
  ValidateIf,
  IsUUID,
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

  @ApiProperty({ required: false })
  @IsOptional()
  @ValidateIf((o) => o.categoryId !== null)
  @IsUUID()
  categoryId?: string | null;

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
  @ValidateIf((o) => o.startDate !== null)
  @IsISO8601()
  startDate?: string | null;

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

  @ApiProperty({ required: false, description: 'Name of the person responsible for this item, or null to clear' })
  @IsOptional()
  @ValidateIf((o) => o.assignedToName !== null)
  @IsString()
  @MaxLength(200)
  assignedToName?: string | null;

  @ApiProperty({ required: false, description: 'Name of the person accountable for this item, or null to clear' })
  @IsOptional()
  @ValidateIf((o) => o.accountableName !== null)
  @IsString()
  @MaxLength(200)
  accountableName?: string | null;

  @ApiProperty({ required: false, description: 'Verified organization member responsible for this task, or null to clear' })
  @IsOptional()
  @ValidateIf((o) => o.assignedToUserId !== null)
  @IsUUID()
  assignedToUserId?: string | null;

  @ApiProperty({ required: false, description: 'Verified organization member accountable for this task, or null to clear' })
  @IsOptional()
  @ValidateIf((o) => o.accountableToUserId !== null)
  @IsUUID()
  accountableToUserId?: string | null;
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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

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
  startDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  accountableToUserId?: string;
}

export class CreateWorkspaceCategoryDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;
}

export class UpdateWorkspaceCategoryDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;
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
