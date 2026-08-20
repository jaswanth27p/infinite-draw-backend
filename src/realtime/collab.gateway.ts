import { Logger, UseGuards } from '@nestjs/common';
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
import { ChatService } from '../chat/chat.service';

type AccessCacheEntry = { role: Role | null; expiresAt: number };

export type CollabSocket = Socket & {
  data: {
    userId: string;
    localUserId: string;
    displayName?: string | null;
    accessCache?: Record<string, AccessCacheEntry>;
  };
};

const fileRoom = (fileId: string) => `file:${fileId}`;

// hasFloor's access verdict is cached per fileId on the socket for this
// long. Short enough that a role downgrade still takes effect quickly;
// long enough to collapse the ~30msg/s mouse-location stream (plus every
// other handler) down to roughly one DB round-trip every few seconds per
// active editor instead of one per message.
const ACCESS_CACHE_TTL_MS = 3000;

// Documented mesh-call cap, not a configurable limit — see the voice-chat
// design spec's "Explicitly out of scope" section (scaling beyond this is
// not solved here).
const MAX_VOICE_PARTICIPANTS = 6;

const isValidFileId = (fileId: unknown): fileId is string =>
  typeof fileId === 'string' && fileId.length > 0;

@WebSocketGateway({
  cors: { origin: getCorsOrigins() },
})
export class CollabGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(CollabGateway.name);

  // Voice-call roster per file, in-memory only — never a Prisma model,
  // same as this gateway's existing cursor/presence tracking. Always a
  // subset of that file's `file:<fileId>` room membership.
  private readonly voiceRosters = new Map<string, Set<string>>();

  constructor(
    private readonly filesService: FilesService,
    private readonly chatService: ChatService,
  ) {}

  private async roomCollaborators(room: string): Promise<string[]> {
    const sockets = await this.server.in(room).fetchSockets();
    return sockets.map((s) => s.id);
  }

  private voiceRoster(fileId: string): Set<string> {
    let roster = this.voiceRosters.get(fileId);
    if (!roster) {
      roster = new Set();
      this.voiceRosters.set(fileId, roster);
    }
    return roster;
  }

  // Authorization (WHAT can this connection do) is re-checked per message —
  // unlike authentication, which is cached once per connection — because a
  // live role change (e.g. a share downgrade) needs to take effect without
  // waiting for a reconnect. The short-TTL cache below only bounds how many
  // DB round-trips that re-check costs; it does not skip the re-check.
  private async hasFloor(
    client: CollabSocket,
    fileId: string,
    minRole: Role,
  ): Promise<boolean> {
    const now = Date.now();
    const cached = client.data.accessCache?.[fileId];
    let role: Role | null;

    if (cached && cached.expiresAt > now) {
      role = cached.role;
    } else {
      const access = await this.filesService.getAccess(
        fileId,
        client.data.localUserId,
      );
      role = access ? access.role : null;
      client.data.accessCache = {
        ...client.data.accessCache,
        [fileId]: { role, expiresAt: now + ACCESS_CACHE_TTL_MS },
      };
    }

    return !!role && ROLE_RANK[role] >= ROLE_RANK[minRole];
  }

  @UseGuards(WsClerkGuard, WsLocalUserGuard)
  @SubscribeMessage('join-room')
  async handleJoinRoom(
    @ConnectedSocket() client: CollabSocket,
    @MessageBody() body: { fileId: string },
  ) {
    if (!isValidFileId(body?.fileId)) {
      throw new WsException('Invalid fileId');
    }

    const access = await this.filesService.getAccess(
      body.fileId,
      client.data.localUserId,
    );
    if (!access) {
      throw new WsException('No access to this file');
    }

    const room = fileRoom(body.fileId);

    // A client should only ever be a member of one file:* room at a time —
    // otherwise scene/mouse/idle events for a previously-joined file could
    // keep flowing into a session that's since moved on to a different
    // file. Leave every other file room before joining the new one.
    for (const joinedRoom of client.rooms ?? []) {
      if (joinedRoom.startsWith('file:') && joinedRoom !== room) {
        await client.leave(joinedRoom);
      }
    }

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
    if (!isValidFileId(body?.fileId)) {
      return;
    }
    if (!(await this.hasFloor(client, body.fileId, 'EDITOR'))) {
      return;
    }
    client
      .to(fileRoom(body.fileId))
      .emit('scene-init', { fileId: body.fileId, elements: body.elements });
  }

  @UseGuards(WsClerkGuard, WsLocalUserGuard)
  @SubscribeMessage('scene-update')
  async handleSceneUpdate(
    @ConnectedSocket() client: CollabSocket,
    @MessageBody() body: { fileId: string; elements: unknown[] },
  ) {
    if (!isValidFileId(body?.fileId)) {
      return;
    }
    if (!(await this.hasFloor(client, body.fileId, 'EDITOR'))) {
      return;
    }
    client
      .to(fileRoom(body.fileId))
      .emit('scene-update', { fileId: body.fileId, elements: body.elements });
  }

  @UseGuards(WsClerkGuard, WsLocalUserGuard)
  @SubscribeMessage('mouse-location')
  async handleMouseLocation(
    @ConnectedSocket() client: CollabSocket,
    @MessageBody()
    body: {
      fileId: string;
      pointer: { x: number; y: number };
      button: 'up' | 'down';
      selectedElementIds: Record<string, boolean>;
      username: string | null;
    },
  ) {
    if (!isValidFileId(body?.fileId)) {
      return;
    }
    if (!(await this.hasFloor(client, body.fileId, 'EDITOR'))) {
      return;
    }
    // Never trust body.username: any connected EDITOR could claim to be
    // anyone. The display name is resolved server-side by WsLocalUserGuard
    // from the local User row and cached on client.data.
    client.volatile.to(fileRoom(body.fileId)).emit('mouse-location', {
      fileId: body.fileId,
      socketId: client.id,
      pointer: body.pointer,
      button: body.button,
      selectedElementIds: body.selectedElementIds,
      username: client.data.displayName ?? null,
    });
  }

  @UseGuards(WsClerkGuard, WsLocalUserGuard)
  @SubscribeMessage('idle-status')
  async handleIdleStatus(
    @ConnectedSocket() client: CollabSocket,
    @MessageBody()
    body: { fileId: string; userState: 'active' | 'idle' | 'away' },
  ) {
    if (!isValidFileId(body?.fileId)) {
      return;
    }
    if (!(await this.hasFloor(client, body.fileId, 'VIEWER'))) {
      return;
    }
    client.volatile.to(fileRoom(body.fileId)).emit('idle-status', {
      fileId: body.fileId,
      socketId: client.id,
      userState: body.userState,
    });
  }

  @UseGuards(WsClerkGuard, WsLocalUserGuard)
  @SubscribeMessage('send-chat-message')
  async handleSendChatMessage(
    @ConnectedSocket() client: CollabSocket,
    @MessageBody() body: { fileId: string; body: string },
  ) {
    if (!isValidFileId(body?.fileId)) {
      return;
    }
    if (!(await this.hasFloor(client, body.fileId, 'VIEWER'))) {
      return;
    }

    const message = await this.chatService
      .create(body.fileId, client.data.localUserId, body.body)
      .catch((err) => {
        this.logger.warn(
          `send-chat-message dropped for file ${body.fileId}: ${(err as Error).message}`,
        );
        return null;
      });
    if (!message) {
      return;
    }

    // Broadcast to the WHOLE room, including the sender — this is the one
    // handler in this gateway that does, since the sender needs the
    // server-assigned id/createdAt/authorName back rather than rendering
    // an optimistic local echo it would have to reconcile later. Every
    // other handler here uses `client.to(...)` (sender excluded) because
    // the sender already has that state locally.
    this.server.to(fileRoom(body.fileId)).emit('chat-message', message);
    // Also returned as a Socket.IO ack to the sender only — the frontend
    // uses this (not the broadcast) to learn which message ids are its
    // own, since a client has no other way to resolve "my local user id"
    // client-side.
    return message;
  }

  @UseGuards(WsClerkGuard, WsLocalUserGuard)
  @SubscribeMessage('join-voice')
  async handleJoinVoice(
    @ConnectedSocket() client: CollabSocket,
    @MessageBody() body: { fileId: string },
  ): Promise<
    | { joined: true; participants: string[] }
    | { joined: false; reason: 'full' | 'no-access' }
  > {
    if (
      !isValidFileId(body?.fileId) ||
      !(await this.hasFloor(client, body.fileId, 'VIEWER'))
    ) {
      return { joined: false, reason: 'no-access' };
    }

    const roster = this.voiceRoster(body.fileId);
    if (roster.size >= MAX_VOICE_PARTICIPANTS) {
      return { joined: false, reason: 'full' };
    }

    // Snapshot the roster's *other* members before adding the caller — the
    // joiner already knows its own id, so it isn't included in the
    // returned list.
    const participants = Array.from(roster);
    roster.add(client.id);
    client.to(fileRoom(body.fileId)).emit('voice-user-joined', { socketId: client.id });

    return { joined: true, participants };
  }

  @UseGuards(WsClerkGuard, WsLocalUserGuard)
  @SubscribeMessage('leave-voice')
  async handleLeaveVoice(
    @ConnectedSocket() client: CollabSocket,
    @MessageBody() body: { fileId: string },
  ) {
    if (!isValidFileId(body?.fileId)) {
      return;
    }
    const roster = this.voiceRosters.get(body.fileId);
    if (!roster?.delete(client.id)) {
      return;
    }
    client.to(fileRoom(body.fileId)).emit('voice-user-left', { socketId: client.id });
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
      // 'disconnecting' fires before Socket.IO clears the socket's rooms, so
      // the leaving client's own id is still present in fetchSockets() here
      // — filter it out so the broadcasted presence list reflects who's
      // actually left in the room.
      const collaborators = (await this.roomCollaborators(room)).filter(
        (id) => id !== client.id,
      );
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
