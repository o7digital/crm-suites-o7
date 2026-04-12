import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ProjectStatus } from '@prisma/client';

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class ListProjectsQueryDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimString(value))
  dealId?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimString(value))
  clientId?: string;

  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;
}
