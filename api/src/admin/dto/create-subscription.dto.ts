import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  customerName!: string;
}

