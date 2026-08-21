import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getCorsOrigins } from '../config/cors';

const MIN_TOPUP_RUPEES = 100;
const CURRENCY = 'inr';

export class InsufficientCreditsException extends HttpException {
  constructor() {
    super('Insufficient credit balance', HttpStatus.PAYMENT_REQUIRED);
  }
}

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

  async reserveUsage(
    userId: string,
    requestId: string,
    estimateRupees: Prisma.Decimal,
  ): Promise<{ id: string; estimateWholeRupees: number }> {
    const existing = await this.prisma.aiUsageReservation.findUnique({ where: { requestId } });
    if (existing) {
      return { id: existing.id, estimateWholeRupees: Math.max(1, Math.ceil(existing.estimatedCostRupees.toNumber())) };
    }

    const estimateWholeRupees = Math.max(1, Math.ceil(estimateRupees.toNumber()));

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Conditional updateMany, not read-then-write: two concurrent reserves
        // for the same user can't both pass a separate balance check and both
        // decrement — Postgres serializes UPDATEs to the same row, so only
        // enough concurrent reserves to actually cover the balance succeed.
        const updated = await tx.user.updateMany({
          where: { id: userId, creditBalance: { gte: estimateWholeRupees } },
          data: { creditBalance: { decrement: estimateWholeRupees } },
        });
        if (updated.count === 0) {
          throw new InsufficientCreditsException();
        }
        const reservation = await tx.aiUsageReservation.create({
          data: { userId, requestId, estimatedCostRupees: estimateRupees, status: 'RESERVED' },
        });
        return { id: reservation.id, estimateWholeRupees };
      });
    } catch (err) {
      // Handle concurrent identical requestId submissions: if both see existing=null
      // and race into $transaction, the loser hits a P2002 unique constraint violation
      // on requestId. Re-fetch and return the winner's reservation. This is idempotency
      // (same requestId always returns the same result), and the loser's balance
      // decrement rolls back automatically with the failed transaction.
      if ((err as { code?: string }).code === 'P2002') {
        const existing = await this.prisma.aiUsageReservation.findUnique({ where: { requestId } });
        if (existing) {
          return { id: existing.id, estimateWholeRupees: Math.max(1, Math.ceil(existing.estimatedCostRupees.toNumber())) };
        }
      }
      throw err;
    }
  }

  async settleUsage(reservationId: string, actualCostRupees: Prisma.Decimal): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const reservation = await tx.aiUsageReservation.findUnique({ where: { id: reservationId } });
      if (!reservation || reservation.status !== 'RESERVED') return;

      const estimateWhole = Math.max(1, Math.ceil(reservation.estimatedCostRupees.toNumber()));
      const clampedActual = Prisma.Decimal.min(actualCostRupees, reservation.estimatedCostRupees);
      const actualWhole = Math.min(estimateWhole, Math.max(0, Math.round(clampedActual.toNumber())));
      const refundWhole = estimateWhole - actualWhole;

      // Guarded on status='RESERVED' in the WHERE clause, not just the read
      // above — this is the actual race guard (see reserveUsage's comment).
      const updated = await tx.aiUsageReservation.updateMany({
        where: { id: reservationId, status: 'RESERVED' },
        data: { status: 'SETTLED', actualCostRupees: clampedActual, settledAt: new Date() },
      });
      if (updated.count === 0) return;

      if (refundWhole > 0) {
        await tx.user.update({
          where: { id: reservation.userId },
          data: { creditBalance: { increment: refundWhole } },
        });
      }
    });
  }

  async refundUsage(reservationId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const reservation = await tx.aiUsageReservation.findUnique({ where: { id: reservationId } });
      if (!reservation || reservation.status !== 'RESERVED') return;

      const estimateWhole = Math.max(1, Math.ceil(reservation.estimatedCostRupees.toNumber()));

      const updated = await tx.aiUsageReservation.updateMany({
        where: { id: reservationId, status: 'RESERVED' },
        data: { status: 'REFUNDED', settledAt: new Date() },
      });
      if (updated.count === 0) return;

      await tx.user.update({
        where: { id: reservation.userId },
        data: { creditBalance: { increment: estimateWhole } },
      });
    });
  }

  async sweepStaleReservations(olderThanMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMs);
    const stale = await this.prisma.aiUsageReservation.findMany({
      where: { status: 'RESERVED', createdAt: { lt: cutoff } },
      select: { id: true },
    });
    for (const { id } of stale) {
      await this.refundUsage(id);
    }
    return stale.length;
  }
}
