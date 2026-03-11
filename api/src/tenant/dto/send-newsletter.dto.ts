import { ArrayNotEmpty, IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class SendNewsletterBaseDto {
  @IsString()
  @MaxLength(160)
  subject: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  preheader?: string;

  @IsString()
  @MaxLength(20000)
  body: string;
}

export class SendNewsletterTestDto extends SendNewsletterBaseDto {}

export class SendNewsletterDto extends SendNewsletterBaseDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  clientIds: string[];
}
