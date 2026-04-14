import { IsEnum } from 'class-validator';

export enum PostSalesCaseStatusDto {
  onboarding = 'onboarding',
  collecting_info = 'collecting_info',
  in_progress = 'in_progress',
  waiting_client = 'waiting_client',
  internal_review = 'internal_review',
  delivery = 'delivery',
  support = 'support',
  done = 'done',
}

export class MovePostSalesCaseDto {
  @IsEnum(PostSalesCaseStatusDto)
  status: PostSalesCaseStatusDto;
}
