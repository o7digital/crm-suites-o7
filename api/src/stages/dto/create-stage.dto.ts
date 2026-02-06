import { IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateStageDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsString()
  pipelineId: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  @IsOptional()
  @IsNumber()
  probability?: number;

  @IsOptional()
  @IsIn(['OPEN', 'WON', 'LOST'])
  status?: 'OPEN' | 'WON' | 'LOST';
}
