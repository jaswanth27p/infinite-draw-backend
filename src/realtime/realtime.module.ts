import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { PingGateway } from './ping.gateway';
import { WsClerkGuard } from './ws-clerk.guard';
import { WsLocalUserGuard } from './ws-local-user.guard';
import { CollabGateway } from './collab.gateway';

@Module({
  imports: [FilesModule],
  providers: [PingGateway, WsClerkGuard, WsLocalUserGuard, CollabGateway],
  exports: [WsClerkGuard],
})
export class RealtimeModule {}
