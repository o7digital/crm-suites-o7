import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreateCheckoutSessionDto {
  @IsString()
  @IsIn(['PULSE_BASIC', 'PULSE_STANDARD', 'PULSE_ADVANCED', 'PULSE_ADVANCED_PLUS', 'PULSE_TEAM'])
  plan!: 'PULSE_BASIC' | 'PULSE_STANDARD' | 'PULSE_ADVANCED' | 'PULSE_ADVANCED_PLUS' | 'PULSE_TEAM';

  @IsOptional()
  @IsString()
  successUrl?: string;

  @IsOptional()
  @IsString()
  cancelUrl?: string;
}

