import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { ProjectTaskPriority, ProjectTaskStatus } from '@prisma/client';

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalInt(value: unknown): number | undefined {
  const parsed = optionalNumber(value);
  if (parsed === undefined) return undefined;
  return Number.isInteger(parsed) ? parsed : undefined;
}

export class CreateProjectTaskDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => trimString(value))
  projectId: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimString(value))
  sectionId?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimString(value))
  clientId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  @Transform(({ value }) => trimString(value))
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @Transform(({ value }) => trimString(value))
  description?: string;

  @IsOptional()
  @IsEnum(ProjectTaskStatus)
  status?: ProjectTaskStatus;

  @IsOptional()
  @IsEnum(ProjectTaskPriority)
  priority?: ProjectTaskPriority;

  @IsOptional()
  @IsUUID('4')
  assigneeUserId?: string;

  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => trimString(value))
  startDate?: string;

  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => trimString(value))
  dueDate?: string;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedHours?: number;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  spentHours?: number;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimString(value))
  parentTaskId?: string;

  @IsOptional()
  @Transform(({ value }) => optionalInt(value))
  @IsInt()
  @Min(0)
  position?: number;
}
