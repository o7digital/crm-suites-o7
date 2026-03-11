import { IsOptional, IsString } from 'class-validator';

export class GoogleCalendarConnectDto {
  @IsOptional()
  @IsString()
  redirectTo?: string;
}
