import { Module } from '@nestjs/common';
import { WsClerkGuard } from '../realtime/ws-clerk.guard';
import { WsLocalUserGuard } from '../realtime/ws-local-user.guard';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';

// WsClerkGuard/WsLocalUserGuard are re-declared here rather than imported
// via RealtimeModule: RealtimeModule already imports FilesModule (for
// CollabGateway's FilesService dependency), and FilesModule needs to
// import NotificationsModule (so SharesService/FilesService can inject
// NotificationsService) — importing RealtimeModule here would create
// FilesModule -> NotificationsModule -> RealtimeModule -> FilesModule.
// Both guards are stateless (WsClerkGuard has no constructor deps,
// WsLocalUserGuard only needs the globally-provided PrismaService), so
// providing the same classes in two modules is safe.
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsGateway, NotificationsService, WsClerkGuard, WsLocalUserGuard],
  exports: [NotificationsService],
})
export class NotificationsModule {}
