import { PartialType } from '@nestjs/mapped-types';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { MovePostSalesCaseDto, PostSalesCaseStatusDto } from './move-post-sales-case.dto';

export enum PostSalesPriorityDto {
  low = 'low',
  medium = 'medium',
  high = 'high',
  urgent = 'urgent',
}

export class UpdatePostSalesCaseDto extends PartialType(MovePostSalesCaseDto) {
  @IsEnum(PostSalesCaseStatusDto)
  @IsOptional()
  status?: PostSalesCaseStatusDto;

  @IsEnum(PostSalesPriorityDto)
  @IsOptional()
  priority?: PostSalesPriorityDto;

  @IsUUID('4')
  @IsOptional()
  ownerUserId?: string | null;

  @IsDateString()
  @IsOptional()
  dueDate?: string | null;
}
