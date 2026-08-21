import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway, notificationRoom } from './notifications.gateway';

describe('NotificationsService', () => {
  const prismaMock = {
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const gatewayMock = {
    server: { to: jest.fn().mockReturnThis(), emit: jest.fn() },
  };

  function buildService() {
    return new NotificationsService(
      prismaMock as unknown as PrismaService,
      gatewayMock as unknown as NotificationsGateway,
    );
  }

  beforeEach(() => jest.clearAllMocks());

  describe('create', () => {
    const row = {
      id: 'n1',
      type: 'FILE_SHARED',
      fileId: 'f1',
      fileName: 'Q3 Roadmap',
      role: 'EDITOR',
      read: false,
      createdAt: new Date('2026-08-18T00:00:00Z'),
      actor: { name: 'Alice', email: 'alice@x.com' },
    };

    it('inserts a Notification row and emits it to the recipient\'s room', async () => {
      prismaMock.notification.create.mockResolvedValue(row);
      const service = buildService();

      await service.create({
        recipientId: 'user_2',
        actorId: 'user_1',
        type: 'FILE_SHARED' as never,
        file: { id: 'f1', name: 'Q3 Roadmap' },
        role: 'EDITOR' as never,
      });

      expect(prismaMock.notification.create).toHaveBeenCalledWith({
        data: {
          userId: 'user_2',
          actorId: 'user_1',
          type: 'FILE_SHARED',
          fileId: 'f1',
          fileName: 'Q3 Roadmap',
          role: 'EDITOR',
        },
        include: { actor: { select: { name: true, email: true } } },
      });
      expect(gatewayMock.server.to).toHaveBeenCalledWith(notificationRoom('user_2'));
      expect(gatewayMock.server.emit).toHaveBeenCalledWith('notification', {
        id: 'n1',
        type: 'FILE_SHARED',
        actorName: 'Alice',
        fileId: 'f1',
        fileName: 'Q3 Roadmap',
        role: 'EDITOR',
        read: false,
        createdAt: row.createdAt,
      });
    });

    it('falls back to the actor\'s email when they have no name set', async () => {
      prismaMock.notification.create.mockResolvedValue({
        ...row,
        actor: { name: null, email: 'bob@x.com' },
      });
      const service = buildService();

      await service.create({
        recipientId: 'user_2',
        actorId: 'user_1',
        type: 'FILE_SHARED' as never,
        file: { id: 'f1', name: 'Q3 Roadmap' },
      });

      expect(gatewayMock.server.emit).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({ actorName: 'bob@x.com' }),
      );
    });

    it('falls back to null actorName when actorId is null (no actor row)', async () => {
      prismaMock.notification.create.mockResolvedValue({ ...row, actor: null });
      const service = buildService();

      await service.create({
        recipientId: 'user_2',
        actorId: null,
        type: 'GENERAL_ACCESS_CHANGED' as never,
        file: { id: 'f1', name: 'Q3 Roadmap' },
      });

      expect(gatewayMock.server.emit).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({ actorName: null }),
      );
    });

    it('never throws when the WS emit fails — the DB write already succeeded', async () => {
      prismaMock.notification.create.mockResolvedValue(row);
      gatewayMock.server.to.mockImplementation(() => {
        throw new Error('redis adapter unreachable');
      });
      const service = buildService();

      await expect(
        service.create({
          recipientId: 'user_2',
          actorId: 'user_1',
          type: 'FILE_SHARED' as never,
          file: { id: 'f1', name: 'Q3 Roadmap' },
        }),
      ).resolves.toBeUndefined();
    });

    it('propagates the error when the DB write itself fails (only the WS emit is fault-tolerant)', async () => {
      prismaMock.notification.create.mockRejectedValue(new Error('db down'));
      const service = buildService();

      await expect(
        service.create({
          recipientId: 'user_2',
          actorId: 'user_1',
          type: 'FILE_SHARED' as never,
          file: { id: 'f1', name: 'Q3 Roadmap' },
        }),
      ).rejects.toThrow('db down');
    });

    it('is a no-op when the recipient is the actor (never notify a user about their own action)', async () => {
      const service = buildService();

      await service.create({
        recipientId: 'user_1',
        actorId: 'user_1',
        type: 'GENERAL_ACCESS_CHANGED' as never,
        file: { id: 'f1', name: 'Q3 Roadmap' },
      });

      expect(prismaMock.notification.create).not.toHaveBeenCalled();
      expect(gatewayMock.server.to).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('returns the newest-first payload shape, scoped to userId', async () => {
      prismaMock.notification.findMany.mockResolvedValue([
        {
          id: 'n1',
          type: 'FILE_SHARED',
          fileId: 'f1',
          fileName: 'Q3 Roadmap',
          role: 'EDITOR',
          read: false,
          createdAt: new Date('2026-08-18T00:00:00Z'),
          actor: { name: 'Alice', email: 'alice@x.com' },
        },
      ]);
      const service = buildService();

      const result = await service.list('user_2', undefined, 20);

      expect(prismaMock.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'user_2' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 20,
        include: { actor: { select: { name: true, email: true } } },
      });
      expect(result).toEqual([
        {
          id: 'n1',
          type: 'FILE_SHARED',
          actorName: 'Alice',
          fileId: 'f1',
          fileName: 'Q3 Roadmap',
          role: 'EDITOR',
          read: false,
          createdAt: new Date('2026-08-18T00:00:00Z'),
        },
      ]);
    });

    it('paginates via cursor when one is provided', async () => {
      prismaMock.notification.findMany.mockResolvedValue([]);
      const service = buildService();

      await service.list('user_2', 'n1', 20);

      expect(prismaMock.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'user_2' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 20,
        cursor: { id: 'n1' },
        skip: 1,
        include: { actor: { select: { name: true, email: true } } },
      });
    });
  });

  it('unreadCount counts only unread rows for that user', async () => {
    prismaMock.notification.count.mockResolvedValue(3);
    const service = buildService();

    const result = await service.unreadCount('user_2');

    expect(result).toBe(3);
    expect(prismaMock.notification.count).toHaveBeenCalledWith({
      where: { userId: 'user_2', read: false },
    });
  });

  it('markRead scopes the update to both the notification id and the caller\'s userId', async () => {
    const service = buildService();

    await service.markRead('user_2', 'n1');

    expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
      where: { id: 'n1', userId: 'user_2' },
      data: { read: true },
    });
  });

  it('markAllRead scopes the update to the caller\'s unread rows only', async () => {
    const service = buildService();

    await service.markAllRead('user_2');

    expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user_2', read: false },
      data: { read: true },
    });
  });
});
