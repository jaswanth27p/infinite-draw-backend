import { BadRequestException } from '@nestjs/common';
import { CreditsService } from './credits.service';
import { PrismaService } from '../prisma/prisma.service';

const mockCreate = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: mockCreate,
      },
    },
  }));
});

describe('CreditsService', () => {
  const prismaMock = {
    creditTopup: {
      create: jest.fn(),
    },
    user: {
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  function buildService() {
    return new CreditsService(prismaMock as unknown as PrismaService);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_xxx';
  });

  describe('createTopupCheckoutSession', () => {
    it('creates a one-time INR Checkout Session with the computed paise amount and the caller as client_reference_id', async () => {
      mockCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/session123' });
      const service = buildService();

      const result = await service.createTopupCheckoutSession('user_1', 250);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'payment',
          client_reference_id: 'user_1',
          line_items: [
            expect.objectContaining({
              quantity: 1,
              price_data: expect.objectContaining({
                currency: 'inr',
                unit_amount: 25000,
              }),
            }),
          ],
        }),
      );
      expect(result).toEqual({ url: 'https://checkout.stripe.com/session123' });
    });

    it('accepts the minimum amount of exactly 100', async () => {
      mockCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/session456' });
      const service = buildService();

      await expect(service.createTopupCheckoutSession('user_1', 100)).resolves.toBeDefined();
    });

    it('rejects an amount below 100 without calling Stripe', async () => {
      const service = buildService();

      await expect(service.createTopupCheckoutSession('user_1', 99)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('rejects a non-integer amount without calling Stripe', async () => {
      const service = buildService();

      await expect(service.createTopupCheckoutSession('user_1', 100.5)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('rejects a negative amount without calling Stripe', async () => {
      const service = buildService();

      await expect(service.createTopupCheckoutSession('user_1', -50)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('handleCheckoutCompleted', () => {
    const session = {
      id: 'cs_test_1',
      client_reference_id: 'user_1',
      amount_total: 25000,
      payment_intent: 'pi_test_1',
    } as unknown as import('stripe').default.Checkout.Session;

    it('creates a CreditTopup row and increments the balance inside one transaction', async () => {
      prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
        fn(prismaMock),
      );
      prismaMock.creditTopup.create.mockResolvedValue({ id: 'topup_1' });
      prismaMock.user.update.mockResolvedValue({ id: 'user_1' });
      const service = buildService();

      await service.handleCheckoutCompleted(session);

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.creditTopup.create).toHaveBeenCalledWith({
        data: {
          userId: 'user_1',
          amountRupees: 250,
          stripeCheckoutSessionId: 'cs_test_1',
          stripePaymentIntentId: 'pi_test_1',
        },
      });
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user_1' },
        data: { creditBalance: { increment: 250 } },
      });
    });

    it('swallows a duplicate stripeCheckoutSessionId (P2002) instead of throwing', async () => {
      const duplicateError = Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
      });
      prismaMock.$transaction.mockRejectedValue(duplicateError);
      const service = buildService();

      await expect(service.handleCheckoutCompleted(session)).resolves.toBeUndefined();
    });

    it('rethrows a non-P2002 error', async () => {
      prismaMock.$transaction.mockRejectedValue(new Error('connection lost'));
      const service = buildService();

      await expect(service.handleCheckoutCompleted(session)).rejects.toThrow('connection lost');
    });

    it('logs and returns without touching the database when client_reference_id is missing', async () => {
      const service = buildService();
      const orphanSession = { ...session, client_reference_id: null } as unknown as import('stripe').default.Checkout.Session;

      await expect(service.handleCheckoutCompleted(orphanSession)).resolves.toBeUndefined();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });
});
