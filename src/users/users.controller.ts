import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { LoadLocalUserGuard } from '../auth/load-local-user.guard';
import { CurrentLocalUserId } from '../auth/current-local-user-id.decorator';
import { UsersService } from './users.service';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';

@Controller('me')
@UseGuards(ClerkAuthGuard, LoadLocalUserGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('notification-preferences')
  getNotificationPreferences(@CurrentLocalUserId() userId: string) {
    return this.usersService.getNotificationPreferences(userId);
  }

  @Patch('notification-preferences')
  updateNotificationPreferences(
    @CurrentLocalUserId() userId: string,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.usersService.updateNotificationPreferences(userId, dto);
  }
}
