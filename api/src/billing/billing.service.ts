import { BadRequestException, Injectable } from '@nestjs/common';
import Stripe = require('stripe');
import { RequestUser } from '../common/user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';

type CrmPlan =
  | 'PULSE_BASIC'
  | 'PULSE_STANDARD'
  | 'PULSE_ADVANCED'
  | 'PULSE_ADVANCED_PLUS'
  | 'PULSE_TEAM';
type StripeClient = InstanceType<typeof Stripe>;
type StripeSubscription = Awaited<ReturnType<StripeClient['subscriptions']['retrieve']>>;
type StripeCheckoutSession = {
  mode?: string | null;
  subscription?: string | { id?: string } | null;
  customer_details?: { email?: string | null } | null;
  customer_email?: string | null;
};
type StripeInvoice = {
  customer?: string | { id?: string } | null;
  subscription?: string | { id?: string } | null;
  parent?: { subscription_details?: { subscription?: string | { id?: string } | null } | null } | null;
};

@Injectable()
export class BillingService {
  private readonly stripe: StripeClient;
  private readonly webhookSecret: string;

  constructor(private prisma: PrismaService) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('Missing STRIPE_SECRET_KEY');
    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
    this.stripe = new Stripe(key, { apiVersion: '2026-05-27.dahlia' });
  }

  constructEvent(rawBody: Buffer, signature: string | undefined) {
    if (!signature) throw new BadRequestException('Missing stripe-signature header');
    if (!this.webhookSecret) throw new BadRequestException('Missing STRIPE_WEBHOOK_SECRET');
    try {
      return this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch {
      throw new BadRequestException('Invalid Stripe signature');
    }
  }

  async handleEvent(event: ReturnType<InstanceType<typeof Stripe>['webhooks']['constructEvent']>) {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.syncCheckoutSession(event.data.object as unknown as StripeCheckoutSession);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.syncStripeSubscription(event.data.object as unknown as StripeSubscription);
        break;
      case 'customer.subscription.deleted':
        await this.syncStripeSubscription(event.data.object as unknown as StripeSubscription, 'CANCELED');
        break;
      case 'invoice.paid':
      case 'invoice.payment_succeeded':
        await this.syncInvoice(event.data.object as unknown as StripeInvoice, 'ACTIVE');
        break;
      case 'invoice.payment_failed':
        await this.syncInvoice(event.data.object as unknown as StripeInvoice, 'PAUSED');
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

  private seatsForPlan(plan: string | undefined): number {
    const seatsByPlan: Record<CrmPlan, number> = {
      PULSE_BASIC: 1,
      PULSE_STANDARD: 3,
      PULSE_ADVANCED: 5,
      PULSE_ADVANCED_PLUS: 10,
      PULSE_TEAM: 30,
    };
    return plan && plan in seatsByPlan ? seatsByPlan[plan as CrmPlan] : 1;
  }

  private statusForStripeSubscription(
    subscription: StripeSubscription,
  ): 'ACTIVE' | 'PAUSED' | 'CANCELED' {
    if (subscription.status === 'canceled') return 'CANCELED';
    if (subscription.status === 'active' || subscription.status === 'trialing') return 'ACTIVE';
    return 'PAUSED';
  }

  private async syncCheckoutSession(session: StripeCheckoutSession) {
    if (session.mode !== 'subscription') return;
    const subscriptionId =
      typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
    if (!subscriptionId) return;
    const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
    await this.syncStripeSubscription(subscription, 'ACTIVE', {
      billingEmail: session.customer_details?.email || session.customer_email || null,
    });
  }

  private async syncInvoice(invoiceData: StripeInvoice, status: 'ACTIVE' | 'PAUSED') {
    const subscriptionRef =
      invoiceData.subscription || invoiceData.parent?.subscription_details?.subscription;
    const subscriptionId =
      typeof subscriptionRef === 'string' ? subscriptionRef : subscriptionRef?.id;
    if (subscriptionId) {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
      await this.syncStripeSubscription(subscription, status);
      return;
    }

    const customerId =
      typeof invoiceData.customer === 'string' ? invoiceData.customer : invoiceData.customer?.id;
    if (!customerId) return;
    await this.prisma.subscription.updateMany({
      where: { stripeCustomerId: customerId },
      data: { status },
    });
  }

  private async syncStripeSubscription(
    subscription: StripeSubscription,
    forcedStatus?: 'ACTIVE' | 'PAUSED' | 'CANCELED',
    opts?: { billingEmail?: string | null },
  ) {
    const tenantId = subscription.metadata.tenantId;
    if (!tenantId) return;

    const plan = subscription.metadata.plan as CrmPlan | undefined;
    const customerId =
      typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
    const firstItem = subscription.items.data[0];
    const currentPeriodEnd = firstItem?.current_period_end
      ? new Date(firstItem.current_period_end * 1000)
      : null;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    });
    if (!tenant) return;

    await this.prisma.subscription.upsert({
      where: { customerTenantId: tenantId },
      update: {
        ...(plan ? { plan } : {}),
        seats: this.seatsForPlan(plan),
        status: forcedStatus || this.statusForStripeSubscription(subscription),
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        stripePriceId: firstItem?.price.id || null,
        billingEmail: opts?.billingEmail || undefined,
        currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      },
      create: {
        tenantId,
        customerTenantId: tenantId,
        customerName: tenant.name,
        contactEmail: opts?.billingEmail || null,
        billingEmail: opts?.billingEmail || null,
        plan: plan || 'PULSE_BASIC',
        seats: this.seatsForPlan(plan),
        status: forcedStatus || this.statusForStripeSubscription(subscription),
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        stripePriceId: firstItem?.price.id || null,
        currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      },
    });
  }
}
