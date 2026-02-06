import { IsString } from 'class-validator';

export class MoveStageDto {
  @IsString()
  stageId: string;
}
