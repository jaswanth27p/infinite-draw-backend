import { BadRequestException } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { WebhookVerificationError } from 'svix';
import { ClerkWebhookController } from './clerk-webhook.controller';
import { ClerkWebhookService } from './clerk-webhook.service';

const mockVerify = jest.fn();

jest.mock('svix', () => {
  const actual = jest.requireActual('svix');
  return {
    ...actual,
    Webhook: jest.fn().mockImplementation(() => ({ verify: mockVerify })),
  };
});

describe('ClerkWebhookController', () => {
  const serviceMock = { handleEvent: jest.fn() };
  let controller: ClerkWebhookController;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CLERK_WEBHOOK_SECRET = 'whsec_test';
    controller = new ClerkWebhookController(serviceMock as unknown as ClerkWebhookService);
  });

  function buildRequest(): RawBodyRequest<Request> {
    return { rawBody: Buffer.from('{}') } as unknown as RawBodyRequest<Request>;
  }

  it('handles a verified event', async () => {
    const event = { type: 'user.created', data: {} };
    mockVerify.mockReturnValue(event);

    const result = await controller.handle(buildRequest(), 'id_1', 'ts_1', 'sig_1');

    expect(serviceMock.handleEvent).toHaveBeenCalledWith(event);
    expect(result).toEqual({ received: true });
  });

  it('throws BadRequestException when svix signature verification fails', async () => {
    mockVerify.mockImplementation(() => {
      throw new WebhookVerificationError('invalid signature');
    });

    await expect(
      controller.handle(buildRequest(), 'id_1', 'ts_1', 'bad-sig'),
    ).rejects.toThrow(BadRequestException);
    expect(serviceMock.handleEvent).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when raw body is missing', async () => {
    const req = { rawBody: undefined } as unknown as RawBodyRequest<Request>;

    await expect(controller.handle(req, 'id_1', 'ts_1', 'sig_1')).rejects.toThrow(
      BadRequestException,
    );
    expect(mockVerify).not.toHaveBeenCalled();
  });
});
