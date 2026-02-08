import { IsIn } from 'class-validator';

export class UpdateUserRoleDto {
  @IsIn(['OWNER', 'ADMIN', 'MEMBER'])
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
}

