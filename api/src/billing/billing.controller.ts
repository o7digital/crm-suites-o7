import { Body, Controller, Headers, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser } from '../common/user.decorator';
import type { RequestUser } from '../common/user.decorator';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @UseGuards(JwtAuthGuard)
  @Post('checkout')
  async checkout(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateCheckoutSessionDto,
  ) {
    return this.billingService.createCheckoutSession(dto, user);
  }

  @Post('webhook/stripe')
  async stripeWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') signature: string | undefined,
    @Body() _body: unknown,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      return { received: false, error: 'Missing raw body' };
    }
    const event = this.billingService.constructEvent(rawBody, signature);
    return this.billingService.handleEvent(event);
  }
}
