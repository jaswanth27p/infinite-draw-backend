import { WsException } from '@nestjs/websockets';
import { CollabGateway } from './collab.gateway';
import { FilesService } from '../files/files.service';

function createClient(
  data: Record<string, unknown> = {
    userId: 'clerk_1',
    localUserId: 'local_1',
    displayName: 'Alice Owner',
  },
) {
  const client: any = {
    id: 'socket_1',
    data,
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn().mockResolvedValue(undefined),
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
    on: jest.fn(),
    rooms: new Set(),
  };
  client.volatile = {
    to: jest.fn(() => client),
  };
  return client;
}

function createServerMock(socketIds: string[]) {
  return {
    in: jest.fn().mockReturnValue({
      fetchSockets: jest
        .fn()
        .mockResolvedValue(socketIds.map((id) => ({ id }))),
    }),
  } as any;
}

describe('CollabGateway', () => {
  const filesServiceMock = { getAccess: jest.fn() };
  let gateway: CollabGateway;

  beforeEach(() => {
    jest.clearAllMocks();
    gateway = new CollabGateway(filesServiceMock as unknown as FilesService);
  });

  describe('join-room', () => {
    it('joins the file room and returns the current collaborator list when access is VIEWER or above', async () => {
      filesServiceMock.getAccess.mockResolvedValue({
        role: 'VIEWER',
        file: { id: 'f1' },
      });
      gateway.server = createServerMock(['socket_1', 'socket_2']);
      const client = createClient();

      const result = await gateway.handleJoinRoom(client, { fileId: 'f1' });

      expect(filesServiceMock.getAccess).toHaveBeenCalledWith('f1', 'local_1');
      expect(client.join).toHaveBeenCalledWith('file:f1');
      expect(result).toEqual({
        event: 'room-init',
        data: { collaborators: ['socket_1', 'socket_2'] },
      });
      expect(client.to).toHaveBeenCalledWith('file:f1');
      expect(client.emit).toHaveBeenCalledWith('room-user-change', {
        collaborators: ['socket_1', 'socket_2'],
      });
    });

    it('rejects with WsException when the caller has no access to the file', async () => {
      filesServiceMock.getAccess.mockResolvedValue(null);
      gateway.server = createServerMock([]);
      const client = createClient();

      await expect(
        gateway.handleJoinRoom(client, { fileId: 'f1' }),
      ).rejects.toBeInstanceOf(WsException);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('rejects with WsException when fileId is missing or not a non-empty string', async () => {
      const client = createClient();

      await expect(
        gateway.handleJoinRoom(client, { fileId: '' } as any),
      ).rejects.toBeInstanceOf(WsException);
      await expect(
        gateway.handleJoinRoom(client, {} as any),
      ).rejects.toBeInstanceOf(WsException);
      await expect(
        gateway.handleJoinRoom(client, { fileId: 42 } as any),
      ).rejects.toBeInstanceOf(WsException);
      expect(filesServiceMock.getAccess).not.toHaveBeenCalled();
    });

    it('leaves other file:* rooms before joining the new one', async () => {
      filesServiceMock.getAccess.mockResolvedValue({
        role: 'VIEWER',
        file: { id: 'f2' },
      });
      gateway.server = createServerMock(['socket_1']);
      const client = createClient();
      client.rooms = new Set(['socket_1', 'file:f1']);

      await gateway.handleJoinRoom(client, { fileId: 'f2' });

      expect(client.leave).toHaveBeenCalledWith('file:f1');
      expect(client.leave).not.toHaveBeenCalledWith('socket_1');
      expect(client.join).toHaveBeenCalledWith('file:f2');
    });

    it('does not leave the room being (re-)joined', async () => {
      filesServiceMock.getAccess.mockResolvedValue({
        role: 'VIEWER',
        file: { id: 'f1' },
      });
      gateway.server = createServerMock(['socket_1']);
      const client = createClient();
      client.rooms = new Set(['socket_1', 'file:f1']);

      await gateway.handleJoinRoom(client, { fileId: 'f1' });

      expect(client.leave).not.toHaveBeenCalled();
    });
  });

  describe('handleConnection', () => {
    it('registers disconnecting handler that notifies rooms of membership change', async () => {
      gateway.server = createServerMock(['socket_2']);
      const client = createClient();
      client.rooms = new Set(['socket_1', 'file:f1']);

      gateway.handleConnection(client);

      // Verify that on('disconnecting', callback) was registered
      expect(client.on).toHaveBeenCalledWith(
        'disconnecting',
        expect.any(Function),
      );

      // Get the registered callback and invoke it to simulate disconnecting event
      const disconnectingCallback = client.on.mock.calls[0][1];
      await disconnectingCallback();

      // Verify the room notification was sent
      expect(client.to).toHaveBeenCalledWith('file:f1');
      expect(client.emit).toHaveBeenCalledWith('room-user-change', {
        collaborators: ['socket_2'],
      });
    });

    it('excludes the leaving client itself from the broadcasted collaborator list', async () => {
      // fetchSockets() still includes the leaving socket at 'disconnecting'
      // time (rooms haven't been cleared yet) — the departed id must be
      // filtered out before broadcasting.
      gateway.server = createServerMock(['socket_1', 'socket_2']);
      const client = createClient();
      client.rooms = new Set(['socket_1', 'file:f1']);

      gateway.handleConnection(client);
      const disconnectingCallback = client.on.mock.calls[0][1];
      await disconnectingCallback();

      expect(client.emit).toHaveBeenCalledWith('room-user-change', {
        collaborators: ['socket_2'],
      });
    });
  });

  describe('scene-init / scene-update', () => {
    it('relays scene-update to the room (excluding sender) when the caller is EDITOR or above', async () => {
      filesServiceMock.getAccess.mockResolvedValue({
        role: 'EDITOR',
        file: { id: 'f1' },
      });
      const client = createClient();

      await gateway.handleSceneUpdate(client, {
        fileId: 'f1',
        elements: [{ id: 'e1', version: 2 }],
      });

      expect(filesServiceMock.getAccess).toHaveBeenCalledWith('f1', 'local_1');
      expect(client.to).toHaveBeenCalledWith('file:f1');
      expect(client.emit).toHaveBeenCalledWith('scene-update', {
        fileId: 'f1',
        elements: [{ id: 'e1', version: 2 }],
      });
    });

    it('relays scene-init the same way, at the same EDITOR floor', async () => {
      filesServiceMock.getAccess.mockResolvedValue({
        role: 'OWNER',
        file: { id: 'f1' },
      });
      const client = createClient();

      await gateway.handleSceneInit(client, {
        fileId: 'f1',
        elements: [{ id: 'e1', version: 1 }],
      });

      expect(client.to).toHaveBeenCalledWith('file:f1');
      expect(client.emit).toHaveBeenCalledWith('scene-init', {
        fileId: 'f1',
        elements: [{ id: 'e1', version: 1 }],
      });
    });

    it('silently drops scene-update when fileId is missing or not a non-empty string', async () => {
      const client = createClient();

      await gateway.handleSceneUpdate(client, { fileId: '' } as any);
      await gateway.handleSceneUpdate(client, {} as any);

      expect(filesServiceMock.getAccess).not.toHaveBeenCalled();
      expect(client.emit).not.toHaveBeenCalled();
    });

    it('silently drops scene-update when the caller is below EDITOR', async () => {
      filesServiceMock.getAccess.mockResolvedValue({
        role: 'VIEWER',
        file: { id: 'f1' },
      });
      const client = createClient();

      await gateway.handleSceneUpdate(client, {
        fileId: 'f1',
        elements: [{ id: 'e1' }],
      });

      expect(client.emit).not.toHaveBeenCalled();
    });

    it('silently drops scene-update when the caller has no access at all', async () => {
      filesServiceMock.getAccess.mockResolvedValue(null);
      const client = createClient();

      await gateway.handleSceneUpdate(client, { fileId: 'f1', elements: [] });

      expect(client.emit).not.toHaveBeenCalled();
    });
  });

  describe('mouse-location / idle-status', () => {
    it('relays mouse-location volatile to the room (excluding sender) at EDITOR floor', async () => {
      filesServiceMock.getAccess.mockResolvedValue({
        role: 'EDITOR',
        file: { id: 'f1' },
      });
      const client = createClient();

      await gateway.handleMouseLocation(client, {
        fileId: 'f1',
        pointer: { x: 1, y: 2 },
        button: 'up',
        selectedElementIds: {},
        username: 'Alice Owner',
      });

      expect(client.volatile.to).toHaveBeenCalledWith('file:f1');
      expect(client.emit).toHaveBeenCalledWith('mouse-location', {
        fileId: 'f1',
        socketId: 'socket_1',
        pointer: { x: 1, y: 2 },
        button: 'up',
        selectedElementIds: {},
        username: 'Alice Owner',
      });
    });

    it('ignores a client-supplied username and uses the server-resolved displayName instead', async () => {
      filesServiceMock.getAccess.mockResolvedValue({
        role: 'EDITOR',
        file: { id: 'f1' },
      });
      const client = createClient({
        userId: 'clerk_1',
        localUserId: 'local_1',
        displayName: 'Real Name',
      });

      await gateway.handleMouseLocation(client, {
        fileId: 'f1',
        pointer: { x: 1, y: 2 },
        button: 'up',
        selectedElementIds: {},
        username: 'Impersonated Name',
      });

      expect(client.emit).toHaveBeenCalledWith(
        'mouse-location',
        expect.objectContaining({ username: 'Real Name' }),
      );
    });

    it('falls back to null when no displayName was cached on the connection', async () => {
      filesServiceMock.getAccess.mockResolvedValue({
        role: 'EDITOR',
        file: { id: 'f1' },
      });
      const client = createClient({
        userId: 'clerk_1',
        localUserId: 'local_1',
      });

      await gateway.handleMouseLocation(client, {
        fileId: 'f1',
        pointer: { x: 1, y: 2 },
        button: 'up',
        selectedElementIds: {},
        username: 'Impersonated Name',
      });

      expect(client.emit).toHaveBeenCalledWith(
        'mouse-location',
        expect.objectContaining({ username: null }),
      );
    });

    it('silently drops mouse-location when fileId is missing or not a non-empty string', async () => {
      const client = createClient();

      await gateway.handleMouseLocation(client, {
        pointer: { x: 0, y: 0 },
        button: 'up',
        selectedElementIds: {},
        username: 'Bob',
      } as any);

      expect(filesServiceMock.getAccess).not.toHaveBeenCalled();
      expect(client.emit).not.toHaveBeenCalled();
    });

    it('silently drops mouse-location below EDITOR floor', async () => {
      filesServiceMock.getAccess.mockResolvedValue({
        role: 'VIEWER',
        file: { id: 'f1' },
      });
      const client = createClient();

      await gateway.handleMouseLocation(client, {
        fileId: 'f1',
        pointer: { x: 0, y: 0 },
        button: 'up',
        selectedElementIds: {},
        username: 'Bob Viewer',
      });

      expect(client.emit).not.toHaveBeenCalled();
    });

    it('relays idle-status volatile to the room at VIEWER floor (a Viewer may broadcast presence)', async () => {
      filesServiceMock.getAccess.mockResolvedValue({
        role: 'VIEWER',
        file: { id: 'f1' },
      });
      const client = createClient();

      await gateway.handleIdleStatus(client, {
        fileId: 'f1',
        userState: 'active',
      });

      expect(client.volatile.to).toHaveBeenCalledWith('file:f1');
      expect(client.emit).toHaveBeenCalledWith('idle-status', {
        fileId: 'f1',
        socketId: 'socket_1',
        userState: 'active',
      });
    });

    it('silently drops idle-status when the caller has no access at all', async () => {
      filesServiceMock.getAccess.mockResolvedValue(null);
      const client = createClient();

      await gateway.handleIdleStatus(client, {
        fileId: 'f1',
        userState: 'active',
      });

      expect(client.emit).not.toHaveBeenCalled();
    });

    it('silently drops idle-status when fileId is missing or not a non-empty string', async () => {
      const client = createClient();

      await gateway.handleIdleStatus(client, { userState: 'active' } as any);

      expect(filesServiceMock.getAccess).not.toHaveBeenCalled();
      expect(client.emit).not.toHaveBeenCalled();
    });
  });

  describe('hasFloor access cache', () => {
    it('caches the access verdict per fileId and skips a second DB round-trip within the TTL window', async () => {
      filesServiceMock.getAccess.mockResolvedValue({
        role: 'EDITOR',
        file: { id: 'f1' },
      });
      const client = createClient();

      await gateway.handleSceneUpdate(client, { fileId: 'f1', elements: [] });
      await gateway.handleSceneUpdate(client, { fileId: 'f1', elements: [] });
      await gateway.handleSceneUpdate(client, { fileId: 'f1', elements: [] });

      expect(filesServiceMock.getAccess).toHaveBeenCalledTimes(1);
    });

    it('re-checks access once the cached entry has expired', async () => {
      jest.useFakeTimers();
      try {
        filesServiceMock.getAccess.mockResolvedValue({
          role: 'EDITOR',
          file: { id: 'f1' },
        });
        const client = createClient();

        await gateway.handleSceneUpdate(client, { fileId: 'f1', elements: [] });
        jest.advanceTimersByTime(3001);
        await gateway.handleSceneUpdate(client, { fileId: 'f1', elements: [] });

        expect(filesServiceMock.getAccess).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });

    it("caches per fileId independently, so a different file is not served from another file's cache", async () => {
      filesServiceMock.getAccess.mockResolvedValue({
        role: 'EDITOR',
        file: { id: 'f1' },
      });
      const client = createClient();

      await gateway.handleSceneUpdate(client, { fileId: 'f1', elements: [] });
      await gateway.handleSceneUpdate(client, { fileId: 'f2', elements: [] });

      expect(filesServiceMock.getAccess).toHaveBeenCalledTimes(2);
      expect(filesServiceMock.getAccess).toHaveBeenNthCalledWith(
        1,
        'f1',
        'local_1',
      );
      expect(filesServiceMock.getAccess).toHaveBeenNthCalledWith(
        2,
        'f2',
        'local_1',
      );
    });
  });
});
