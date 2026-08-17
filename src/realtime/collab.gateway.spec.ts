import { WsException } from '@nestjs/websockets';
import { CollabGateway } from './collab.gateway';
import { FilesService } from '../files/files.service';

function createClient(data: Record<string, unknown> = { userId: 'clerk_1', localUserId: 'local_1' }) {
  const client: any = {
    id: 'socket_1',
    data,
    join: jest.fn().mockResolvedValue(undefined),
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
      fetchSockets: jest.fn().mockResolvedValue(socketIds.map((id) => ({ id }))),
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
      filesServiceMock.getAccess.mockResolvedValue({ role: 'VIEWER', file: { id: 'f1' } });
      gateway.server = createServerMock(['socket_1', 'socket_2']);
      const client = createClient();

      const result = await gateway.handleJoinRoom(client, { fileId: 'f1' });

      expect(filesServiceMock.getAccess).toHaveBeenCalledWith('f1', 'local_1');
      expect(client.join).toHaveBeenCalledWith('file:f1');
      expect(result).toEqual({ event: 'room-init', data: { collaborators: ['socket_1', 'socket_2'] } });
      expect(client.to).toHaveBeenCalledWith('file:f1');
      expect(client.emit).toHaveBeenCalledWith('room-user-change', {
        collaborators: ['socket_1', 'socket_2'],
      });
    });

    it('rejects with WsException when the caller has no access to the file', async () => {
      filesServiceMock.getAccess.mockResolvedValue(null);
      gateway.server = createServerMock([]);
      const client = createClient();

      await expect(gateway.handleJoinRoom(client, { fileId: 'f1' })).rejects.toBeInstanceOf(
        WsException,
      );
      expect(client.join).not.toHaveBeenCalled();
    });
  });

  describe('handleConnection', () => {
    it('registers disconnecting handler that notifies rooms of membership change', async () => {
      gateway.server = createServerMock(['socket_2']);
      const client = createClient();
      client.rooms = new Set(['socket_1', 'file:f1']);

      gateway.handleConnection(client);

      // Verify that on('disconnecting', callback) was registered
      expect(client.on).toHaveBeenCalledWith('disconnecting', expect.any(Function));

      // Get the registered callback and invoke it to simulate disconnecting event
      const disconnectingCallback = client.on.mock.calls[0][1];
      await disconnectingCallback();

      // Verify the room notification was sent
      expect(client.to).toHaveBeenCalledWith('file:f1');
      expect(client.emit).toHaveBeenCalledWith('room-user-change', { collaborators: ['socket_2'] });
    });
  });

  describe('scene-init / scene-update', () => {
    it('relays scene-update to the room (excluding sender) when the caller is EDITOR or above', async () => {
      filesServiceMock.getAccess.mockResolvedValue({ role: 'EDITOR', file: { id: 'f1' } });
      const client = createClient();

      await gateway.handleSceneUpdate(client, { fileId: 'f1', elements: [{ id: 'e1', version: 2 }] });

      expect(filesServiceMock.getAccess).toHaveBeenCalledWith('f1', 'local_1');
      expect(client.to).toHaveBeenCalledWith('file:f1');
      expect(client.emit).toHaveBeenCalledWith('scene-update', {
        elements: [{ id: 'e1', version: 2 }],
      });
    });

    it('relays scene-init the same way, at the same EDITOR floor', async () => {
      filesServiceMock.getAccess.mockResolvedValue({ role: 'OWNER', file: { id: 'f1' } });
      const client = createClient();

      await gateway.handleSceneInit(client, { fileId: 'f1', elements: [{ id: 'e1', version: 1 }] });

      expect(client.to).toHaveBeenCalledWith('file:f1');
      expect(client.emit).toHaveBeenCalledWith('scene-init', {
        elements: [{ id: 'e1', version: 1 }],
      });
    });

    it('silently drops scene-update when the caller is below EDITOR', async () => {
      filesServiceMock.getAccess.mockResolvedValue({ role: 'VIEWER', file: { id: 'f1' } });
      const client = createClient();

      await gateway.handleSceneUpdate(client, { fileId: 'f1', elements: [{ id: 'e1' }] });

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
      filesServiceMock.getAccess.mockResolvedValue({ role: 'EDITOR', file: { id: 'f1' } });
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
        socketId: 'socket_1',
        pointer: { x: 1, y: 2 },
        button: 'up',
        selectedElementIds: {},
        username: 'Alice Owner',
      });
    });

    it('silently drops mouse-location below EDITOR floor', async () => {
      filesServiceMock.getAccess.mockResolvedValue({ role: 'VIEWER', file: { id: 'f1' } });
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
      filesServiceMock.getAccess.mockResolvedValue({ role: 'VIEWER', file: { id: 'f1' } });
      const client = createClient();

      await gateway.handleIdleStatus(client, { fileId: 'f1', userState: 'active' });

      expect(client.volatile.to).toHaveBeenCalledWith('file:f1');
      expect(client.emit).toHaveBeenCalledWith('idle-status', {
        socketId: 'socket_1',
        userState: 'active',
      });
    });

    it('silently drops idle-status when the caller has no access at all', async () => {
      filesServiceMock.getAccess.mockResolvedValue(null);
      const client = createClient();

      await gateway.handleIdleStatus(client, { fileId: 'f1', userState: 'active' });

      expect(client.emit).not.toHaveBeenCalled();
    });
  });
});
