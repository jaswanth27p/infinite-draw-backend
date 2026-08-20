import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { LoadLocalUserGuard } from '../auth/load-local-user.guard';
import { CurrentLocalUserId } from '../auth/current-local-user-id.decorator';
import { CreditsService } from './credits.service';

@Controller('credits')
@UseGuards(ClerkAuthGuard, LoadLocalUserGuard)
export class CreditsController {
  constructor(private readonly creditsService: CreditsService) {}

  @Get('balance')
  async balance(@CurrentLocalUserId() userId: string) {
    const balance = await this.creditsService.getBalance(userId);
    return { balance };
  }

  @Post('checkout')
  async checkout(
    @CurrentLocalUserId() userId: string,
    @Body() body: { amountRupees: number },
  ) {
    return this.creditsService.createTopupCheckoutSession(
      userId,
      body.amountRupees,
    );
  }
}
