import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import Razorpay from 'razorpay';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const MIN_TOPUP_RUPEES = 100;
const CURRENCY = 'INR';

export interface RazorpayPaymentEntity {
  id: string;
  order_id: string;
  status: string;
  currency: string;
  amount: number;
  notes?: Record<string, string>;
}

export class InsufficientCreditsException extends HttpException {
  constructor() {
    super('Insufficient credit balance', HttpStatus.PAYMENT_REQUIRED);
  }
}

@Injectable()
export class CreditsService {
  private readonly logger = new Logger(CreditsService.name);
  private readonly razorpay: Razorpay;

  constructor(private readonly prisma: PrismaService) {
    this.razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID as string,
      key_secret: process.env.RAZORPAY_KEY_SECRET as string,
    });
  }

  async getBalance(userId: string): Promise<number> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { creditBalance: true },
    });
    return user.creditBalance;
  }

  async createRazorpayOrder(
    userId: string,
    amountRupees: number,
  ): Promise<{ orderId: string; amount: number; currency: string; keyId: string }> {
    if (!Number.isInteger(amountRupees) || amountRupees < MIN_TOPUP_RUPEES) {
      throw new BadRequestException(
        `amountRupees must be an integer of at least ${MIN_TOPUP_RUPEES}`,
      );
    }

    // `notes.userId` is how handlePaymentCaptured() later identifies whose
    // balance to credit — Razorpay's payment.captured webhook payload has
    // no equivalent to Stripe Checkout Session's built-in
    // client_reference_id, but it does echo back the order's notes.
    const order = await this.razorpay.orders.create({
      amount: amountRupees * 100,
      currency: CURRENCY,
      receipt: `topup_${userId}_${Date.now()}`,
      notes: { userId },
    });

    return {
      orderId: order.id,
      amount: amountRupees * 100,
      currency: CURRENCY,
      keyId: process.env.RAZORPAY_KEY_ID as string,
    };
  }

  async handlePaymentCaptured(entity: RazorpayPaymentEntity): Promise<void> {
    if (entity.status !== 'captured') {
      this.logger.log(
        `Payment ${entity.id} has status ${entity.status}, not captured, skipping`,
      );
      return;
    }

    if (entity.currency !== CURRENCY) {
      this.logger.warn(
        `Payment ${entity.id} has unexpected currency ${entity.currency}, expected ${CURRENCY}, skipping`,
      );
      return;
    }

    const amountRupees = entity.amount / 100;
    if (!Number.isInteger(amountRupees)) {
      this.logger.warn(
        `Payment ${entity.id} has amount ${entity.amount} ${entity.currency} which is not a whole number of rupees, skipping`,
      );
      return;
    }

    if (!entity.order_id) {
      this.logger.warn(`Payment ${entity.id} has no order_id, skipping`);
      return;
    }

    const userId = entity.notes?.userId;
    if (!userId) {
      this.logger.warn(
        `Payment ${entity.id} (order ${entity.order_id}) has no notes.userId, skipping`,
      );
      return;
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.creditTopup.create({
          data: {
            userId,
            amountRupees,
            razorpayOrderId: entity.order_id,
            razorpayPaymentId: entity.id,
          },
        });
        await tx.user.update({
          where: { id: userId },
          data: { creditBalance: { increment: amountRupees } },
        });
      });
    } catch (err) {
      // A retried webhook delivery for an already-processed order hits
      // the unique constraint on razorpayOrderId — expected, not an
      // error. Any other failure (a real DB outage, etc.) rethrows so
      // Razorpay's own retry mechanism gets a chance to redeliver later.
      if ((err as { code?: string }).code === 'P2002') {
        this.logger.warn(`Order ${entity.order_id} already processed, skipping`);
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
