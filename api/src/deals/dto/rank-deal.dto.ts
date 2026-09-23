import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
export class RankDealDto {
  @IsString() stageId: string;
  @IsOptional() @IsString() targetId?: string;
  @IsOptional() @IsIn(['before', 'after']) placement?: 'before' | 'after';
  @IsDateString() expectedUpdatedAt: string;
}
export class UndoCloseDto {
  @IsUUID('4') eventId: string;
}
