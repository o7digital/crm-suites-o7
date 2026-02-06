import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePipelineDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
