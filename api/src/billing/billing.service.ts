import { BadRequestException, Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { RequestUser } from '../common/user.decorator';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';

@Injectable()
export class BillingService {
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor() {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('Missing STRIPE_SECRET_KEY');
    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
    this.stripe = new Stripe(key, { apiVersion: '2025-09-30.clover' });
  }

  constructEvent(rawBody: Buffer, signature: string | undefined): Stripe.Event {
    if (!signature) throw new BadRequestException('Missing stripe-signature header');
    if (!this.webhookSecret) throw new BadRequestException('Missing STRIPE_WEBHOOK_SECRET');
    try {
      return this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch {
      throw new BadRequestException('Invalid Stripe signature');
    }
  }

  async handleEvent(event: Stripe.Event) {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed':
        // Billing fields migration will persist Stripe IDs/status in next step.
        break;
      default:
        break;
    }
    return { received: true };
  }

  async createCheckoutSession(dto: CreateCheckoutSessionDto, user: RequestUser) {
    const priceIdByPlan: Record<CreateCheckoutSessionDto['plan'], string | undefined> = {
      PULSE_BASIC: process.env.CRM_PULSE_BASIC_PRICE_ID,
      PULSE_STANDARD: process.env.CRM_PULSE_STANDARD_PRICE_ID,
      PULSE_ADVANCED: process.env.CRM_PULSE_ADVANCED_PRICE_ID,
      PULSE_ADVANCED_PLUS: process.env.CRM_PULSE_ADVANCED_PLUS_PRICE_ID,
      PULSE_TEAM: process.env.CRM_PULSE_TEAM_PRICE_ID,
    };
    const priceId = priceIdByPlan[dto.plan];
    if (!priceId) throw new BadRequestException(`Missing Stripe price ID for ${dto.plan}`);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
    const successUrl = dto.successUrl || `${appUrl}/account?billing=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = dto.cancelUrl || `${appUrl}/account?billing=canceled`;

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: user.email,
      metadata: {
        tenantId: user.tenantId,
        userId: user.userId,
        plan: dto.plan,
      },
      subscription_data: {
        metadata: {
          tenantId: user.tenantId,
          userId: user.userId,
          plan: dto.plan,
        },
      },
    });

    return { url: session.url, id: session.id };
  }
}
