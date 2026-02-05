import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export enum TaskStatusEnum {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
}

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsEnum(TaskStatusEnum)
  @IsOptional()
  status?: TaskStatusEnum;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsString()
  @IsNotEmpty()
  clientId: string;
}
