import { Controller, Get, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from './clerk-auth.guard';
import { CurrentUser } from './current-user.decorator';

@Controller('me')
@UseGuards(ClerkAuthGuard)
export class MeController {
  @Get()
  getMe(@CurrentUser() userId: string) {
    return { userId };
  }
}
