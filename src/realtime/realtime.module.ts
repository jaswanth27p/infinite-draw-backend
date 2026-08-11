import { Module } from '@nestjs/common';
import { PingGateway } from './ping.gateway';
import { WsClerkGuard } from './ws-clerk.guard';

@Module({
  providers: [PingGateway, WsClerkGuard],
  exports: [WsClerkGuard],
})
export class RealtimeModule {}
