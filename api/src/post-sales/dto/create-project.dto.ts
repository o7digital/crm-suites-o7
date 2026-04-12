import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import {
  ProjectHealthStatus,
  ProjectPriority,
  ProjectStatus,
} from '@prisma/client';

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  @Transform(({ value }) => trimString(value))
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @Transform(({ value }) => trimString(value))
  description?: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => trimString(value))
  clientId: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimString(value))
  dealId?: string;

  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @IsOptional()
  @IsEnum(ProjectPriority)
  priority?: ProjectPriority;

  @IsOptional()
  @IsEnum(ProjectHealthStatus)
  healthStatus?: ProjectHealthStatus;

  @IsOptional()
  @IsUUID('4')
  ownerUserId?: string;

  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => trimString(value))
  startDate?: string;

  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => trimString(value))
  dueDate?: string;
}
