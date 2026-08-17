import { UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { WsClerkGuard } from './ws-clerk.guard';
import { WsLocalUserGuard } from './ws-local-user.guard';
import { getCorsOrigins } from '../config/cors';
import { FilesService } from '../files/files.service';

export type CollabSocket = Socket & { data: { userId: string; localUserId: string } };

const fileRoom = (fileId: string) => `file:${fileId}`;

@WebSocketGateway({
  cors: { origin: getCorsOrigins() },
})
export class CollabGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly filesService: FilesService) {}

  private async roomCollaborators(room: string): Promise<string[]> {
    const sockets = await this.server.in(room).fetchSockets();
    return sockets.map((s) => s.id);
  }

  @UseGuards(WsClerkGuard, WsLocalUserGuard)
  @SubscribeMessage('join-room')
  async handleJoinRoom(
    @ConnectedSocket() client: CollabSocket,
    @MessageBody() body: { fileId: string },
  ) {
    const access = await this.filesService.getAccess(body.fileId, client.data.localUserId);
    if (!access) {
      throw new WsException('No access to this file');
    }

    const room = fileRoom(body.fileId);
    await client.join(room);

    const collaborators = await this.roomCollaborators(room);
    client.to(room).emit('room-user-change', { collaborators });

    return { event: 'room-init', data: { collaborators } };
  }

  // Nest's OnGatewayDisconnect fires once per socket, after Socket.IO has
  // already removed it from every room it was in — `client.rooms` (a Set
  // Socket.IO maintains) still reflects the *pre-leave* membership at the
  // moment this fires, which is exactly what we need to know which rooms
  // to notify.
  async handleDisconnect(@ConnectedSocket() client: CollabSocket) {
    for (const room of client.rooms ?? []) {
      if (!room.startsWith('file:')) {
        continue;
      }
      const collaborators = await this.roomCollaborators(room);
      client.to(room).emit('room-user-change', { collaborators });
    }
  }
}
