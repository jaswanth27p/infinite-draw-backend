import { UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { WsClerkGuard } from '../realtime/ws-clerk.guard';
import { WsLocalUserGuard } from '../realtime/ws-local-user.guard';
import { getCorsOrigins } from '../config/cors';

export type NotificationSocket = Socket & {
  data: { userId: string; localUserId: string };
};

export const notificationRoom = (userId: string) => `user:${userId}`;

@WebSocketGateway({
  cors: { origin: getCorsOrigins() },
})
export class NotificationsGateway {
  @WebSocketServer()
  server!: Server;

  // No role/access floor here, unlike CollabGateway's per-file rooms — a
  // user's own notification room is gated only by "you are who your Clerk
  // token says you are" (both guards already establish that).
  @UseGuards(WsClerkGuard, WsLocalUserGuard)
  @SubscribeMessage('join-notifications')
  handleJoinNotifications(@ConnectedSocket() client: NotificationSocket) {
    client.join(notificationRoom(client.data.localUserId));
  }
}
