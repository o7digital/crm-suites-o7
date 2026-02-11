import { IsEmail, IsIn, IsOptional, IsString } from 'class-validator';

export class CreateUserInviteDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['OWNER', 'ADMIN', 'MEMBER'])
  role?: 'OWNER' | 'ADMIN' | 'MEMBER';
}
