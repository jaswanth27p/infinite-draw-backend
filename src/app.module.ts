import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { RedisModule } from './redis/redis.module';
import { QueueModule } from './queue/queue.module';
import { RealtimeModule } from './realtime/realtime.module';
import { StorageModule } from './storage/storage.module';
import { FilesModule } from './files/files.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ChatModule } from './chat/chat.module';
import { VoiceModule } from './voice/voice.module';
import { CreditsModule } from './credits/credits.module';
import { AiDiagramModule } from './ai-diagram/ai-diagram.module';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    AuthModule,
    WebhooksModule,
    RedisModule,
    QueueModule,
    RealtimeModule,
    StorageModule,
    FilesModule,
    NotificationsModule,
    ChatModule,
    VoiceModule,
    CreditsModule,
    AiDiagramModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
