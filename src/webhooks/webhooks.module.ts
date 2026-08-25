import { Module } from '@nestjs/common';
import { ClerkWebhookController } from './clerk-webhook.controller';
import { ClerkWebhookService } from './clerk-webhook.service';
import { RazorpayWebhookController } from './razorpay-webhook.controller';
import { CreditsModule } from '../credits/credits.module';

@Module({
  imports: [CreditsModule],
  controllers: [ClerkWebhookController, RazorpayWebhookController],
  providers: [ClerkWebhookService],
})
export class WebhooksModule {}
