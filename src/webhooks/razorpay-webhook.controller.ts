import { BadRequestException, Controller, Headers, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import Razorpay from 'razorpay';
import { CreditsService } from '../credits/credits.service';

@Controller('webhooks/razorpay')
export class RazorpayWebhookController {
  constructor(private readonly creditsService: CreditsService) {}

  @Post()
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature: string,
  ) {
    if (!req.rawBody) {
      throw new BadRequestException('Missing raw body');
    }

    const isValid = Razorpay.validateWebhookSignature(
      req.rawBody.toString('utf8'),
      signature,
      process.env.RAZORPAY_WEBHOOK_SECRET as string,
    );

    if (!isValid) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const event = JSON.parse(req.rawBody.toString('utf8'));

    if (event.event === 'payment.captured') {
      await this.creditsService.handlePaymentCaptured(event.payload.payment.entity);
    }

    return { received: true };
  }
}
