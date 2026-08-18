import { Controller, Get, HttpCode, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { LoadLocalUserGuard } from '../auth/load-local-user.guard';
import { CurrentLocalUserId } from '../auth/current-local-user-id.decorator';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(ClerkAuthGuard, LoadLocalUserGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async list(
    @CurrentLocalUserId() userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = limit ? Number(limit) : NaN;
    const take = Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 50) : 20;
    const items = await this.notificationsService.list(userId, cursor, take);
    const nextCursor = items.length > 0 && items.length === take ? items[items.length - 1].id : null;
    return { items, nextCursor };
  }

  @Get('unread-count')
  async unreadCount(@CurrentLocalUserId() userId: string) {
    const count = await this.notificationsService.unreadCount(userId);
    return { count };
  }

  @Patch(':id/read')
  @HttpCode(204)
  async markRead(@CurrentLocalUserId() userId: string, @Param('id') id: string) {
    await this.notificationsService.markRead(userId, id);
  }

  @Patch('read-all')
  @HttpCode(204)
  async markAllRead(@CurrentLocalUserId() userId: string) {
    await this.notificationsService.markAllRead(userId);
  }
}
