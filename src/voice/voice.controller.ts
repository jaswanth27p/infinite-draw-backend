import { Controller, Get, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { LoadLocalUserGuard } from '../auth/load-local-user.guard';
import { CurrentLocalUserId } from '../auth/current-local-user-id.decorator';
import { VoiceService } from './voice.service';

@Controller('voice')
@UseGuards(ClerkAuthGuard, LoadLocalUserGuard)
export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  // No FileAccessGuard/RequireRole here, unlike every file-scoped controller
  // in this codebase — TURN credentials aren't file-scoped, only
  // caller-authenticated (any signed-in user with a provisioned local
  // account can mint one).
  @Get('turn-credentials')
  turnCredentials(@CurrentLocalUserId() userId: string) {
    const { username, credential, ttl } = this.voiceService.generateTurnCredentials(userId);
    const turnHost = process.env.TURN_HOST ?? 'localhost';

    return {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        {
          urls: [`turn:${turnHost}:3478`],
          username,
          credential,
        },
      ],
      ttl,
    };
  }
}
