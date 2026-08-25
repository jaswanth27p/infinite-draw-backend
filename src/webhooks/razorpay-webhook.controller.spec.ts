import { BadRequestException } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { RazorpayWebhookController } from './razorpay-webhook.controller';
import { CreditsService } from '../credits/credits.service';

const mockValidateWebhookSignature = jest.fn();

jest.mock('razorpay', () => {
  const RazorpayMock = jest.fn().mockImplementation(() => ({}));
  // Assigned as a wrapper closure, not a direct reference — jest.mock's
  // factory runs hoisted above this file's `const mockValidateWebhookSignature`
  // declaration, so directly reading that binding's value here (rather than
  // deferring the read into a closure invoked later, once the module has
  // finished loading) hits a genuine temporal-dead-zone error.
  (RazorpayMock as unknown as { validateWebhookSignature: (...args: unknown[]) => boolean }).validateWebhookSignature =
    (...args: unknown[]) => mockValidateWebhookSignature(...args);
  return RazorpayMock;
});

describe('RazorpayWebhookController', () => {
  const creditsServiceMock = { handlePaymentCaptured: jest.fn() };
  let controller: RazorpayWebhookController;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test';
    controller = new RazorpayWebhookController(
      creditsServiceMock as unknown as CreditsService,
    );
  });

  function buildRequest(body: object): RawBodyRequest<Request> {
    return { rawBody: Buffer.from(JSON.stringify(body)) } as unknown as RawBodyRequest<Request>;
  }

  it('dispatches a verified payment.captured event to CreditsService', async () => {
    mockValidateWebhookSignature.mockReturnValue(true);
    const paymentEntity = {
      id: 'pay_1',
      order_id: 'order_1',
      status: 'captured',
      currency: 'INR',
      amount: 25000,
    };

    const result = await controller.handle(
      buildRequest({ event: 'payment.captured', payload: { payment: { entity: paymentEntity } } }),
      'sig_1',
    );

    expect(creditsServiceMock.handlePaymentCaptured).toHaveBeenCalledWith(paymentEntity);
    expect(result).toEqual({ received: true });
  });

  it('ignores an event type it does not handle, without calling CreditsService', async () => {
    mockValidateWebhookSignature.mockReturnValue(true);

    const result = await controller.handle(
      buildRequest({ event: 'order.paid', payload: { order: { entity: {} } } }),
      'sig_1',
    );

    expect(creditsServiceMock.handlePaymentCaptured).not.toHaveBeenCalled();
    expect(result).toEqual({ received: true });
  });

  it('throws BadRequestException when signature verification fails', async () => {
    mockValidateWebhookSignature.mockReturnValue(false);

    await expect(
      controller.handle(buildRequest({ event: 'payment.captured', payload: {} }), 'bad-sig'),
    ).rejects.toThrow(BadRequestException);
    expect(creditsServiceMock.handlePaymentCaptured).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when raw body is missing', async () => {
    const req = { rawBody: undefined } as unknown as RawBodyRequest<Request>;

    await expect(controller.handle(req, 'sig_1')).rejects.toThrow(BadRequestException);
    expect(mockValidateWebhookSignature).not.toHaveBeenCalled();
  });
});
