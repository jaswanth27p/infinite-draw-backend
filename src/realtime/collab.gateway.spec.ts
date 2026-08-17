import { WsException } from '@nestjs/websockets';
import { CollabGateway } from './collab.gateway';
import { FilesService } from '../files/files.service';

function createClient(data: Record<string, unknown> = { userId: 'clerk_1', localUserId: 'local_1' }) {
  return {
    id: 'socket_1',
    data,
    join: jest.fn().mockResolvedValue(undefined),
    to: jest.fn().mockReturnThis(),
    volatile: { to: jest.fn().mockReturnThis() },
    emit: jest.fn(),
  } as any;
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

  describe('handleDisconnect', () => {
    it('notifies every room the socket was in that membership changed', async () => {
      gateway.server = createServerMock(['socket_2']);
      const client = createClient();
      client.rooms = new Set(['socket_1', 'file:f1']);

      await gateway.handleDisconnect(client);

      expect(client.to).toHaveBeenCalledWith('file:f1');
      expect(client.emit).toHaveBeenCalledWith('room-user-change', { collaborators: ['socket_2'] });
    });
  });
});
