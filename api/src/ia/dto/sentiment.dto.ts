import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class SentimentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  @Transform(({ value }) => trimString(value))
  text: string;
}
