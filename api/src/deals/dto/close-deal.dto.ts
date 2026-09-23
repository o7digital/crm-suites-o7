import { Transform } from 'class-transformer';
import {
  IsUUID,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export const DEAL_LOSS_REASONS = [
  'price',
  'no_response',
  'competitor',
  'budget',
  'project_cancelled',
  'timing',
  'other',
] as const;

export type DealLossReasonValue = (typeof DEAL_LOSS_REASONS)[number];

function normalizeStatus(value: unknown) {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

export class CloseDealDto {
  @IsOptional() @IsUUID('4') operationId?: string;
  @IsOptional() @IsDateString() expectedUpdatedAt?: string;

  @Transform(({ value }) => normalizeStatus(value))
  @IsIn(['WON', 'LOST'])
  status: 'WON' | 'LOST';

  @IsOptional()
  @IsNumber()
  @Min(0)
  finalValue?: number;

  @IsOptional()
  @IsDateString()
  closedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  note?: string;

  @ValidateIf((dto: CloseDealDto) => dto.status === 'LOST')
  @IsIn(DEAL_LOSS_REASONS)
  lossReason?: DealLossReasonValue;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  lossComment?: string;

  @IsOptional()
  @IsDateString()
  followUpAt?: string;

  @IsOptional()
  @IsBoolean()
  prepareOnboarding?: boolean;

  @IsOptional()
  @IsBoolean()
  createFollowUp?: boolean;
}
