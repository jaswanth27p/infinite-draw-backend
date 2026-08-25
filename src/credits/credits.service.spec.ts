import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreditsService } from './credits.service';
import { PrismaService } from '../prisma/prisma.service';

const mockOrdersCreate = jest.fn();

jest.mock('razorpay', () => {
  return jest.fn().mockImplementation(() => ({
    orders: {
      create: mockOrdersCreate,
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
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    aiUsageReservation: {
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  function buildService() {
    return new CreditsService(prismaMock as unknown as PrismaService);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RAZORPAY_KEY_ID = 'rzp_test_key_id';
    process.env.RAZORPAY_KEY_SECRET = 'rzp_test_key_secret';
  });

  describe('getBalance', () => {
    it('reads the credit balance via findUniqueOrThrow and returns it', async () => {
      prismaMock.user.findUniqueOrThrow.mockResolvedValue({
        creditBalance: 450,
      });
      const service = buildService();

      const result = await service.getBalance('user_1');

      expect(prismaMock.user.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 'user_1' },
        select: { creditBalance: true },
      });
      expect(result).toBe(450);
    });
  });

  describe('createRazorpayOrder', () => {
    it('creates a Razorpay order with the paise amount, INR currency, and the caller in notes', async () => {
      mockOrdersCreate.mockResolvedValue({
        id: 'order_test123',
        amount: 25000,
        currency: 'INR',
      });
      const service = buildService();

      const result = await service.createRazorpayOrder('user_1', 250);

      expect(mockOrdersCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 25000,
          currency: 'INR',
          notes: { userId: 'user_1' },
        }),
      );
      expect(result).toEqual({
        orderId: 'order_test123',
        amount: 25000,
        currency: 'INR',
        keyId: 'rzp_test_key_id',
      });
    });

    it('accepts the minimum amount of exactly 100', async () => {
      mockOrdersCreate.mockResolvedValue({ id: 'order_test456', amount: 10000, currency: 'INR' });
      const service = buildService();

      await expect(
        service.createRazorpayOrder('user_1', 100),
      ).resolves.toBeDefined();
    });

    it('rejects an amount below 100 without calling Razorpay', async () => {
      const service = buildService();

      await expect(
        service.createRazorpayOrder('user_1', 99),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockOrdersCreate).not.toHaveBeenCalled();
    });

    it('rejects a non-integer amount without calling Razorpay', async () => {
      const service = buildService();

      await expect(
        service.createRazorpayOrder('user_1', 100.5),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockOrdersCreate).not.toHaveBeenCalled();
    });

    it('rejects a negative amount without calling Razorpay', async () => {
      const service = buildService();

      await expect(
        service.createRazorpayOrder('user_1', -50),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockOrdersCreate).not.toHaveBeenCalled();
    });
  });

  describe('handlePaymentCaptured', () => {
    const entity = {
      id: 'pay_test_1',
      order_id: 'order_test_1',
      status: 'captured',
      currency: 'INR',
      amount: 25000,
      notes: { userId: 'user_1' },
    };

    it('creates a CreditTopup row and increments the balance inside one transaction', async () => {
      prismaMock.$transaction.mockImplementation(
        async (fn: (tx: unknown) => unknown) => fn(prismaMock),
      );
      prismaMock.creditTopup.create.mockResolvedValue({ id: 'topup_1' });
      prismaMock.user.update.mockResolvedValue({ id: 'user_1' });
      const service = buildService();

      await service.handlePaymentCaptured(entity);

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.creditTopup.create).toHaveBeenCalledWith({
        data: {
          userId: 'user_1',
          amountRupees: 250,
          razorpayOrderId: 'order_test_1',
          razorpayPaymentId: 'pay_test_1',
        },
      });
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user_1' },
        data: { creditBalance: { increment: 250 } },
      });
    });

    it('swallows a duplicate razorpayOrderId (P2002) instead of throwing', async () => {
      const duplicateError = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      prismaMock.$transaction.mockRejectedValue(duplicateError);
      const service = buildService();

      await expect(service.handlePaymentCaptured(entity)).resolves.toBeUndefined();
    });

    it('rethrows a non-P2002 error', async () => {
      prismaMock.$transaction.mockRejectedValue(new Error('connection lost'));
      const service = buildService();

      await expect(service.handlePaymentCaptured(entity)).rejects.toThrow('connection lost');
    });

    it('logs and returns without touching the database when status is not captured', async () => {
      const service = buildService();

      await expect(
        service.handlePaymentCaptured({ ...entity, status: 'authorized' }),
      ).resolves.toBeUndefined();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('logs and returns without touching the database when the currency is not INR', async () => {
      const service = buildService();

      await expect(
        service.handlePaymentCaptured({ ...entity, currency: 'USD' }),
      ).resolves.toBeUndefined();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('logs and returns without touching the database when amount is not a whole number of rupees', async () => {
      const service = buildService();

      await expect(
        service.handlePaymentCaptured({ ...entity, amount: 12345 }),
      ).resolves.toBeUndefined();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('logs and returns without touching the database when order_id is missing', async () => {
      const service = buildService();

      await expect(
        service.handlePaymentCaptured({ ...entity, order_id: '' }),
      ).resolves.toBeUndefined();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('logs and returns without touching the database when notes.userId is missing', async () => {
      const service = buildService();

      await expect(
        service.handlePaymentCaptured({ ...entity, notes: {} }),
      ).resolves.toBeUndefined();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('reserveUsage', () => {
    it('reserves by decrementing the rounded-up estimate and creating a RESERVED row inside one transaction', async () => {
      prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prismaMock));
      prismaMock.aiUsageReservation.findUnique.mockResolvedValue(null);
      prismaMock.user.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.aiUsageReservation.create.mockResolvedValue({ id: 'res_1' });
      const service = buildService();

      const result = await service.reserveUsage('user_1', 'req_1', new Prisma.Decimal('2.3'));

      expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user_1', creditBalance: { gte: 3 } },
        data: { creditBalance: { decrement: 3 } },
      });
      expect(prismaMock.aiUsageReservation.create).toHaveBeenCalledWith({
        data: { userId: 'user_1', requestId: 'req_1', estimatedCostRupees: expect.any(Prisma.Decimal), status: 'RESERVED' },
      });
      expect(result).toEqual({ id: 'res_1', estimateWholeRupees: 3 });
    });

    it('rejects with a 402 InsufficientCreditsException when balance is insufficient, without creating a reservation', async () => {
      prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prismaMock));
      prismaMock.aiUsageReservation.findUnique.mockResolvedValue(null);
      prismaMock.user.updateMany.mockResolvedValue({ count: 0 });
      const service = buildService();

      await expect(service.reserveUsage('user_1', 'req_1', new Prisma.Decimal('5'))).rejects.toMatchObject({
        status: 402,
      });
      expect(prismaMock.aiUsageReservation.create).not.toHaveBeenCalled();
    });

    it('returns the existing reservation instead of double-reserving on a retried requestId', async () => {
      prismaMock.aiUsageReservation.findUnique.mockResolvedValue({
        id: 'res_existing',
        estimatedCostRupees: new Prisma.Decimal('4'),
      });
      const service = buildService();

      const result = await service.reserveUsage('user_1', 'req_1', new Prisma.Decimal('4'));

      expect(result).toEqual({ id: 'res_existing', estimateWholeRupees: 4 });
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('settleUsage', () => {
    it('settles, refunding the unused portion of the estimate rounded to whole rupees', async () => {
      prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prismaMock));
      prismaMock.aiUsageReservation.findUnique.mockResolvedValue({
        id: 'res_1',
        userId: 'user_1',
        status: 'RESERVED',
        estimatedCostRupees: new Prisma.Decimal('5'),
      });
      prismaMock.aiUsageReservation.updateMany.mockResolvedValue({ count: 1 });
      const service = buildService();

      await service.settleUsage('res_1', new Prisma.Decimal('2'));

      expect(prismaMock.aiUsageReservation.updateMany).toHaveBeenCalledWith({
        where: { id: 'res_1', status: 'RESERVED' },
        data: { status: 'SETTLED', actualCostRupees: expect.any(Prisma.Decimal), settledAt: expect.any(Date) },
      });
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user_1' },
        data: { creditBalance: { increment: 3 } },
      });
    });

    it('clamps actual cost to the estimate and issues no refund when actual meets or exceeds it', async () => {
      prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prismaMock));
      prismaMock.aiUsageReservation.findUnique.mockResolvedValue({
        id: 'res_1',
        userId: 'user_1',
        status: 'RESERVED',
        estimatedCostRupees: new Prisma.Decimal('3'),
      });
      prismaMock.aiUsageReservation.updateMany.mockResolvedValue({ count: 1 });
      const service = buildService();

      await service.settleUsage('res_1', new Prisma.Decimal('999'));

      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('is a no-op when the reservation is no longer RESERVED (double-settle guard)', async () => {
      prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prismaMock));
      prismaMock.aiUsageReservation.findUnique.mockResolvedValue({
        id: 'res_1',
        userId: 'user_1',
        status: 'SETTLED',
        estimatedCostRupees: new Prisma.Decimal('3'),
      });
      const service = buildService();

      await service.settleUsage('res_1', new Prisma.Decimal('1'));

      expect(prismaMock.aiUsageReservation.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('enforces the status=RESERVED guard in updateMany: when count=0, does not refund', async () => {
      prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prismaMock));
      prismaMock.aiUsageReservation.findUnique.mockResolvedValue({
        id: 'res_1',
        userId: 'user_1',
        status: 'RESERVED',
        estimatedCostRupees: new Prisma.Decimal('5'),
      });
      prismaMock.aiUsageReservation.updateMany.mockResolvedValue({ count: 0 });
      const service = buildService();

      await service.settleUsage('res_1', new Prisma.Decimal('2'));

      expect(prismaMock.aiUsageReservation.updateMany).toHaveBeenCalledWith({
        where: { id: 'res_1', status: 'RESERVED' },
        data: { status: 'SETTLED', actualCostRupees: expect.any(Prisma.Decimal), settledAt: expect.any(Date) },
      });
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });
  });

  describe('refundUsage', () => {
    it('refunds the full rounded-up estimate and marks REFUNDED', async () => {
      prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prismaMock));
      prismaMock.aiUsageReservation.findUnique.mockResolvedValue({
        id: 'res_1',
        userId: 'user_1',
        status: 'RESERVED',
        estimatedCostRupees: new Prisma.Decimal('2.1'),
      });
      prismaMock.aiUsageReservation.updateMany.mockResolvedValue({ count: 1 });
      const service = buildService();

      await service.refundUsage('res_1');

      expect(prismaMock.aiUsageReservation.updateMany).toHaveBeenCalledWith({
        where: { id: 'res_1', status: 'RESERVED' },
        data: { status: 'REFUNDED', settledAt: expect.any(Date) },
      });
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user_1' },
        data: { creditBalance: { increment: 3 } },
      });
    });

    it('is a safe no-op when called twice (idempotent)', async () => {
      prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prismaMock));
      prismaMock.aiUsageReservation.findUnique.mockResolvedValueOnce({
        id: 'res_1', userId: 'user_1', status: 'RESERVED', estimatedCostRupees: new Prisma.Decimal('2'),
      });
      prismaMock.aiUsageReservation.updateMany.mockResolvedValueOnce({ count: 1 });
      const service = buildService();
      await service.refundUsage('res_1');

      prismaMock.aiUsageReservation.findUnique.mockResolvedValueOnce({
        id: 'res_1', userId: 'user_1', status: 'REFUNDED', estimatedCostRupees: new Prisma.Decimal('2'),
      });
      await service.refundUsage('res_1');

      expect(prismaMock.user.update).toHaveBeenCalledTimes(1);
    });

    it('enforces the status=RESERVED guard in updateMany: when count=0, does not refund', async () => {
      prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prismaMock));
      prismaMock.aiUsageReservation.findUnique.mockResolvedValue({
        id: 'res_1', userId: 'user_1', status: 'RESERVED', estimatedCostRupees: new Prisma.Decimal('2.1'),
      });
      prismaMock.aiUsageReservation.updateMany.mockResolvedValue({ count: 0 });
      const service = buildService();

      await service.refundUsage('res_1');

      expect(prismaMock.aiUsageReservation.updateMany).toHaveBeenCalledWith({
        where: { id: 'res_1', status: 'RESERVED' },
        data: { status: 'REFUNDED', settledAt: expect.any(Date) },
      });
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });
  });

  describe('sweepStaleReservations', () => {
    it('refunds every RESERVED row older than the cutoff and returns the count', async () => {
      prismaMock.aiUsageReservation.findMany.mockResolvedValue([{ id: 'res_1' }, { id: 'res_2' }]);
      prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prismaMock));
      prismaMock.aiUsageReservation.findUnique.mockResolvedValue({
        id: 'res_1', userId: 'user_1', status: 'RESERVED', estimatedCostRupees: new Prisma.Decimal('1'),
      });
      prismaMock.aiUsageReservation.updateMany.mockResolvedValue({ count: 1 });
      const service = buildService();

      const count = await service.sweepStaleReservations(5 * 60 * 1000);

      expect(prismaMock.aiUsageReservation.findMany).toHaveBeenCalledWith({
        where: { status: 'RESERVED', createdAt: { lt: expect.any(Date) } },
        select: { id: true },
      });
      expect(count).toBe(2);
    });
  });
});
