import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { getCorsOrigins } from '../config/cors';

const MIN_TOPUP_RUPEES = 100;
const CURRENCY = 'inr';

@Injectable()
export class CreditsService {
  private readonly logger = new Logger(CreditsService.name);
  private readonly stripe: Stripe;

  constructor(private readonly prisma: PrismaService) {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
  }

  async getBalance(userId: string): Promise<number> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { creditBalance: true },
    });
    return user.creditBalance;
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

    // Reuses CORS_ORIGIN (via getCorsOrigins()) as the single "where does the
    // frontend live" source of truth, instead of introducing a second,
    // undocumented APP_URL variable for the same concept.
    const corsOrigins = getCorsOrigins();
    const appUrl = Array.isArray(corsOrigins) ? corsOrigins[0] : corsOrigins;
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      client_reference_id: userId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: CURRENCY,
            unit_amount: amountRupees * 100,
            product_data: { name: `${amountRupees} credits` },
          },
        },
      ],
      success_url: `${appUrl}/?checkout=success`,
      cancel_url: `${appUrl}/?checkout=cancelled`,
    });

    if (!session.url) {
      throw new Error(
        `Stripe Checkout Session ${session.id} was created without a redirect url`,
      );
    }

    return { url: session.url };
  }

  async handleCheckoutCompleted(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const userId = session.client_reference_id;
    if (!userId) {
      this.logger.warn(
        `Checkout session ${session.id} has no client_reference_id, skipping`,
      );
      return;
    }

    if (session.payment_status !== 'paid') {
      this.logger.log(
        `Checkout session ${session.id} is not paid yet (payment_status=${session.payment_status}), skipping until it settles`,
      );
      return;
    }

    if (session.amount_total == null) {
      this.logger.warn(
        `Checkout session ${session.id} has no amount_total, skipping`,
      );
      return;
    }

    if (session.currency !== CURRENCY) {
      this.logger.warn(
        `Checkout session ${session.id} has unexpected currency ${session.currency}, expected ${CURRENCY}, skipping`,
      );
      return;
    }

    const amountRupees = session.amount_total / 100;
    if (!Number.isInteger(amountRupees)) {
      this.logger.warn(
        `Checkout session ${session.id} has amount_total ${session.amount_total} ${session.currency} which is not a whole number of rupees, skipping`,
      );
      return;
    }

    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : null;

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
        this.logger.warn(
          `Checkout session ${session.id} already processed, skipping`,
        );
        return;
      }
      throw err;
    }
  }
}
