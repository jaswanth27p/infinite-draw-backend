import {
  BadRequestException,
  Controller,
  Headers,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import Stripe from 'stripe';
import { CreditsService } from '../credits/credits.service';

@Controller('webhooks/stripe')
export class StripeWebhookController {
  private readonly stripe: Stripe;

  constructor(private readonly creditsService: CreditsService) {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
  }

  @Post()
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!req.rawBody) {
      throw new BadRequestException('Missing raw body');
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET as string,
      );
    } catch {
      throw new BadRequestException('Invalid webhook signature');
    }

    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      await this.creditsService.handleCheckoutCompleted(event.data.object);
    }

    return { received: true };
  }
}
