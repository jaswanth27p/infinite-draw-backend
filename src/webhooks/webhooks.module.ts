import { Module } from '@nestjs/common';
import { ClerkWebhookController } from './clerk-webhook.controller';
import { ClerkWebhookService } from './clerk-webhook.service';
import { StripeWebhookController } from './stripe-webhook.controller';
import { CreditsModule } from '../credits/credits.module';

@Module({
  imports: [CreditsModule],
  controllers: [ClerkWebhookController, StripeWebhookController],
  providers: [ClerkWebhookService],
})
export class WebhooksModule {}
