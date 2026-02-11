import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser } from '../common/user.decorator';
import type { RequestUser } from '../common/user.decorator';
import { AdminService } from './admin.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { CreateUserInviteDto } from './dto/create-user-invite.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';

@UseGuards(JwtAuthGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  listUsers(@CurrentUser() user: RequestUser) {
    return this.adminService.listUsers(user);
  }

  @Get('user-invites')
  listUserInvites(@CurrentUser() user: RequestUser) {
    return this.adminService.listUserInvites(user);
  }

  @Post('user-invites')
  createUserInvite(@Body() dto: CreateUserInviteDto, @CurrentUser() user: RequestUser) {
    return this.adminService.createUserInvite(dto, user);
  }

  @Delete('user-invites/:id')
  revokeUserInvite(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.adminService.revokeUserInvite(id, user);
  }

  @Patch('users/:id')
  updateUserRole(@Param('id') id: string, @Body() dto: UpdateUserRoleDto, @CurrentUser() user: RequestUser) {
    return this.adminService.updateUserRole(id, dto.role, user);
  }

  @Get('subscriptions')
  listSubscriptions(@CurrentUser() user: RequestUser) {
    return this.adminService.listSubscriptions(user);
  }

  @Post('subscriptions')
  createSubscription(@Body() dto: CreateSubscriptionDto, @CurrentUser() user: RequestUser) {
    return this.adminService.createSubscription(dto, user);
  }
}
