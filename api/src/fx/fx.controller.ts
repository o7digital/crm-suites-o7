import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { FxService } from './fx.service';

@UseGuards(JwtAuthGuard)
@Controller('fx')
export class FxController {
  constructor(private readonly fx: FxService) {}

  @Get('usd')
  usdRates() {
    return this.fx.getUsdRates();
  }
}

