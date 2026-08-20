import { BadRequestException } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { StripeWebhookController } from './stripe-webhook.controller';
import { CreditsService } from '../credits/credits.service';

const mockConstructEvent = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    webhooks: { constructEvent: mockConstructEvent },
  }));
});

describe('StripeWebhookController', () => {
  const creditsServiceMock = { handleCheckoutCompleted: jest.fn() };
  let controller: StripeWebhookController;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    process.env.STRIPE_SECRET_KEY = 'sk_test_xxx';
    controller = new StripeWebhookController(creditsServiceMock as unknown as CreditsService);
  });

  function buildRequest(): RawBodyRequest<Request> {
    return { rawBody: Buffer.from('{}') } as unknown as RawBodyRequest<Request>;
  }

  it('dispatches a verified checkout.session.completed event to CreditsService', async () => {
    const session = { id: 'cs_test_1' };
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: session },
    });

    const result = await controller.handle(buildRequest(), 'sig_1');

    expect(creditsServiceMock.handleCheckoutCompleted).toHaveBeenCalledWith(session);
    expect(result).toEqual({ received: true });
  });

  it('ignores an event type it does not handle, without calling CreditsService', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: {} },
    });

    const result = await controller.handle(buildRequest(), 'sig_1');

    expect(creditsServiceMock.handleCheckoutCompleted).not.toHaveBeenCalled();
    expect(result).toEqual({ received: true });
  });

  it('throws BadRequestException when signature verification fails', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('invalid signature');
    });

    await expect(controller.handle(buildRequest(), 'bad-sig')).rejects.toThrow(
      BadRequestException,
    );
    expect(creditsServiceMock.handleCheckoutCompleted).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when raw body is missing', async () => {
    const req = { rawBody: undefined } as unknown as RawBodyRequest<Request>;

    await expect(controller.handle(req, 'sig_1')).rejects.toThrow(BadRequestException);
    expect(mockConstructEvent).not.toHaveBeenCalled();
  });
});
