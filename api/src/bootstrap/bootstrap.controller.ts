import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser, RequestUser } from '../common/user.decorator';
import { BootstrapService } from './bootstrap.service';

@UseGuards(JwtAuthGuard)
@Controller('bootstrap')
export class BootstrapController {
  constructor(private readonly bootstrapService: BootstrapService) {}

  @Post()
  async ensure(
    @CurrentUser() user: RequestUser,
    @Body() body: { name?: string; tenantName?: string },
  ) {
    await this.bootstrapService.ensure(user, body);
    return { ok: true };
  }
}
