import { UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { WsClerkGuard } from './ws-clerk.guard';

@WebSocketGateway({
  cors: { origin: process.env.CORS_ORIGIN?.split(',') ?? 'http://localhost:3000' },
})
export class PingGateway {
  @UseGuards(WsClerkGuard)
  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    return { event: 'pong', data: { userId: client.data.userId, echo: body } };
  }
}
