import { PartialType } from '@nestjs/mapped-types';
import { CreateTaskDto } from './create-task.dto';
import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateTaskDto extends PartialType(CreateTaskDto) {
  @IsString()
  @IsOptional()
  clientId?: string;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsUUID('4')
  @IsOptional()
  postSalesCaseId?: string;
}
