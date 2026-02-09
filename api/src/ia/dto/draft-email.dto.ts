import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class DraftEmailDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Transform(({ value }) => trimString(value))
  leadName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10_000)
  @Transform(({ value }) => trimString(value))
  leadContext: string;
}
