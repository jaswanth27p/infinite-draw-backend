import { UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { WsClerkGuard } from './ws-clerk.guard';
import { getCorsOrigins } from '../config/cors';

@WebSocketGateway({
  cors: { origin: getCorsOrigins() },
})
export class PingGateway {
  // Nest WS guards don't apply gateway-wide: @UseGuards(WsClerkGuard) must be
  // re-applied on every @SubscribeMessage handler in every gateway, or the
  // handler ships unauthenticated.
  @UseGuards(WsClerkGuard)
  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    return { event: 'pong', data: { userId: client.data.userId, echo: body } };
  }
}
