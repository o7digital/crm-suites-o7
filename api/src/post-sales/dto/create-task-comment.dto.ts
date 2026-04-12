import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateTaskCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  @Transform(({ value }) => trimString(value))
  body: string;
}
