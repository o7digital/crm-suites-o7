import { IsString } from 'class-validator';

export class ReopenDealDto {
  @IsString()
  stageId: string;
}
