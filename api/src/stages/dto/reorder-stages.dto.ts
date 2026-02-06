import { ArrayMinSize, IsArray, IsInt, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class StageOrderItemDto {
  @IsString()
  id: string;

  @IsInt()
  @Min(0)
  position: number;
}

export class ReorderStagesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StageOrderItemDto)
  items: StageOrderItemDto[];
}
