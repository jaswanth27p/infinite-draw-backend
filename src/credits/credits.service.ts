import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';

const MIN_TOPUP_RUPEES = 100;

@Injectable()
export class CreditsService {
  private readonly logger = new Logger(CreditsService.name);
  private readonly stripe: Stripe;

  constructor(private readonly prisma: PrismaService) {
    // If the installed `stripe` SDK's types require an `apiVersion` in the
    // constructor options, pass the exact literal Step 1 identified here as
    // a second constructor argument, e.g.
    // new Stripe(process.env.STRIPE_SECRET_KEY as string, { apiVersion: '...' })
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
  }

  async createTopupCheckoutSession(
    userId: string,
    amountRupees: number,
  ): Promise<{ url: string }> {
    if (!Number.isInteger(amountRupees) || amountRupees < MIN_TOPUP_RUPEES) {
      throw new BadRequestException(
        `amountRupees must be an integer of at least ${MIN_TOPUP_RUPEES}`,
      );
    }

    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      client_reference_id: userId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'inr',
            unit_amount: amountRupees * 100,
            product_data: { name: `${amountRupees} credits` },
          },
        },
      ],
      success_url: `${appUrl}/?checkout=success`,
      cancel_url: `${appUrl}/?checkout=cancelled`,
    });

    return { url: session.url as string };
  }

  async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const userId = session.client_reference_id;
    if (!userId) {
      this.logger.warn(`Checkout session ${session.id} has no client_reference_id, skipping`);
      return;
    }

    const amountRupees = (session.amount_total ?? 0) / 100;
    const paymentIntentId =
      typeof session.payment_intent === 'string' ? session.payment_intent : null;

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.creditTopup.create({
          data: {
            userId,
            amountRupees,
            stripeCheckoutSessionId: session.id,
            stripePaymentIntentId: paymentIntentId,
          },
        });
        await tx.user.update({
          where: { id: userId },
          data: { creditBalance: { increment: amountRupees } },
        });
      });
    } catch (err) {
      // A retried webhook delivery for an already-processed session hits
      // the unique constraint on stripeCheckoutSessionId — expected, not
      // an error. Any other failure (a real DB outage, etc.) rethrows so
      // Stripe's own retry mechanism gets a chance to redeliver later.
      if ((err as { code?: string }).code === 'P2002') {
        this.logger.warn(`Checkout session ${session.id} already processed, skipping`);
        return;
      }
      throw err;
    }
  }
}
