import { BadRequestException, Controller, Headers, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Webhook } from 'svix';
import { ClerkWebhookService } from './clerk-webhook.service';

@Controller('webhooks/clerk')
export class ClerkWebhookController {
  constructor(private readonly service: ClerkWebhookService) {}

  @Post()
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('svix-id') svixId: string,
    @Headers('svix-timestamp') svixTimestamp: string,
    @Headers('svix-signature') svixSignature: string,
  ) {
    if (!req.rawBody) {
      throw new BadRequestException('Missing raw body');
    }

    const webhook = new Webhook(process.env.CLERK_WEBHOOK_SECRET as string);
    const event = webhook.verify(req.rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as { type: string; data: Record<string, unknown> };

    await this.service.handleEvent(event);
    return { received: true };
  }
}
