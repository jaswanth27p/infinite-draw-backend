import { UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
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
import { Role, ROLE_RANK } from '../files/role';

export type CollabSocket = Socket & { data: { userId: string; localUserId: string } };

const fileRoom = (fileId: string) => `file:${fileId}`;

@WebSocketGateway({
  cors: { origin: getCorsOrigins() },
})
export class CollabGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly filesService: FilesService) {}

  private async roomCollaborators(room: string): Promise<string[]> {
    const sockets = await this.server.in(room).fetchSockets();
    return sockets.map((s) => s.id);
  }

  private async hasFloor(fileId: string, localUserId: string, minRole: Role): Promise<boolean> {
    const access = await this.filesService.getAccess(fileId, localUserId);
    return !!access && ROLE_RANK[access.role] >= ROLE_RANK[minRole];
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

  @UseGuards(WsClerkGuard, WsLocalUserGuard)
  @SubscribeMessage('scene-init')
  async handleSceneInit(
    @ConnectedSocket() client: CollabSocket,
    @MessageBody() body: { fileId: string; elements: unknown[] },
  ) {
    if (!(await this.hasFloor(body.fileId, client.data.localUserId, 'EDITOR'))) {
      return;
    }
    client.to(fileRoom(body.fileId)).emit('scene-init', { elements: body.elements });
  }

  @UseGuards(WsClerkGuard, WsLocalUserGuard)
  @SubscribeMessage('scene-update')
  async handleSceneUpdate(
    @ConnectedSocket() client: CollabSocket,
    @MessageBody() body: { fileId: string; elements: unknown[] },
  ) {
    if (!(await this.hasFloor(body.fileId, client.data.localUserId, 'EDITOR'))) {
      return;
    }
    client.to(fileRoom(body.fileId)).emit('scene-update', { elements: body.elements });
  }

  // Hook into the 'disconnecting' event (fires before Socket.IO clears rooms)
  // to capture and notify rooms of the socket's departure. We register this
  // in handleConnection for each socket so it has access to client.rooms
  // in its original state before leaveAll() empties it.
  private async notifyRoomsOnLeave(client: CollabSocket) {
    for (const room of client.rooms ?? []) {
      if (!room.startsWith('file:')) {
        continue;
      }
      const collaborators = await this.roomCollaborators(room);
      client.to(room).emit('room-user-change', { collaborators });
    }
  }

  handleConnection(@ConnectedSocket() client: CollabSocket) {
    client.on('disconnecting', async () => {
      await this.notifyRoomsOnLeave(client).catch(() => {
        // Suppress unhandled promise rejection; disconnection side-effects are non-critical
      });
    });
  }
}
