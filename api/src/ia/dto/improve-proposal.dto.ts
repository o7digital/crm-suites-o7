import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class ImproveProposalDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50_000)
  @Transform(({ value }) => trimString(value))
  proposalText: string;
}
