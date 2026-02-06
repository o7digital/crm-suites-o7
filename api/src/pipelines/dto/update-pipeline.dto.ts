import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePipelineDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
