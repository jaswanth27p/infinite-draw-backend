import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { LoadLocalUserGuard } from '../auth/load-local-user.guard';
import { FileAccessGuard } from '../files/file-access.guard';
import { RequireRole } from '../files/require-role.decorator';
import { ChatService } from './chat.service';

@Controller('files/:fileId/messages')
@UseGuards(ClerkAuthGuard, LoadLocalUserGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  @UseGuards(FileAccessGuard)
  @RequireRole('VIEWER')
  async list(
    @Param('fileId') fileId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = limit ? Number(limit) : NaN;
    const take = Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 50) : 30;
    const rows = await this.chatService.list(fileId, cursor, take + 1);
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    const nextCursor = hasMore ? items[items.length - 1].id : null;
    return { items, nextCursor };
  }
}
