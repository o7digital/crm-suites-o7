import { IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateStageDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

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
