import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FilesService } from './files.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('FilesService', () => {
  const prismaMock = {
    file: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    share: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    star: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const notificationsServiceMock = { create: jest.fn() };

  async function buildService() {
    const module = await Test.createTestingModule({
      providers: [
        FilesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NotificationsService, useValue: notificationsServiceMock },
      ],
    }).compile();
    return module.get(FilesService);
  }

  beforeEach(() => jest.clearAllMocks());

  it("lists only the owner's non-deleted files", async () => {
    const service = await buildService();
    prismaMock.file.findMany.mockResolvedValue([{ id: 'f1' }]);
    prismaMock.star.findMany.mockResolvedValue([]);

    const result = await service.list('owner_1');

    expect(result).toEqual([{ id: 'f1', starred: false }]);
    expect(prismaMock.file.findMany).toHaveBeenCalledWith({
      where: { ownerId: 'owner_1', deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      select: expect.objectContaining({
        id: true,
        name: true,
        thumbnailUrl: true,
        updatedAt: true,
      }),
    });
  });

  it('creates a blank file owned by the caller', async () => {
    const service = await buildService();
    prismaMock.file.create.mockResolvedValue({ id: 'f2', ownerId: 'owner_1' });

    const result = await service.create('owner_1');

    expect(result).toEqual({ id: 'f2', ownerId: 'owner_1' });
    expect(prismaMock.file.create).toHaveBeenCalledWith({
      data: {
        ownerId: 'owner_1',
        name: 'Untitled',
        currentData: { elements: [], appState: {} },
      },
    });
  });

  it('update writes the given fields without re-checking ownership (the caller is guard-gated)', async () => {
    const service = await buildService();
    prismaMock.file.update.mockResolvedValue({ id: 'f5', name: 'Renamed' });

    const result = await service.update('f5', { name: 'Renamed' });

    expect(result).toEqual({ id: 'f5', name: 'Renamed' });
    expect(prismaMock.file.update).toHaveBeenCalledWith({
      where: { id: 'f5' },
      data: { name: 'Renamed' },
    });
    expect(prismaMock.file.findFirst).not.toHaveBeenCalled();
  });

  it('update only ever forwards its own whitelisted fields to Prisma, even if extra keys are smuggled onto the dto', async () => {
    const service = await buildService();
    prismaMock.file.update.mockResolvedValue({ id: 'f5', name: 'Renamed' });

    await service.update('f5', {
      name: 'Renamed',
      generalAccess: 'ANYONE',
      generalAccessRole: 'EDITOR',
      ownerId: 'attacker',
    } as never);

    expect(prismaMock.file.update).toHaveBeenCalledWith({
      where: { id: 'f5' },
      data: { name: 'Renamed' },
    });
  });

  it('softDelete sets deletedAt without re-checking ownership (the caller is guard-gated via @RequireRole(OWNER))', async () => {
    const service = await buildService();
    prismaMock.file.update.mockResolvedValue({
      id: 'f5',
      deletedAt: new Date(),
    });

    await service.softDelete('f5');

    expect(prismaMock.file.update).toHaveBeenCalledWith({
      where: { id: 'f5' },
      data: { deletedAt: expect.any(Date) },
    });
    expect(prismaMock.file.findFirst).not.toHaveBeenCalled();
  });

  it('restore clears deletedAt without re-checking ownership (the caller is guard-gated via @RequireRole(OWNER) + @AllowDeleted)', async () => {
    const service = await buildService();
    prismaMock.file.update.mockResolvedValue({
      id: 'f5',
      deletedAt: null,
    });

    await service.restore('f5');

    expect(prismaMock.file.update).toHaveBeenCalledWith({
      where: { id: 'f5' },
      data: { deletedAt: null },
    });
    expect(prismaMock.file.findFirst).not.toHaveBeenCalled();
  });

  describe('getAccess', () => {
    it('returns OWNER when the caller owns the file, without checking shares', async () => {
      const service = await buildService();
      prismaMock.file.findFirst.mockResolvedValue({ id: 'f1', ownerId: 'owner_1' });

      const result = await service.getAccess('f1', 'owner_1');

      expect(result).toEqual({ role: 'OWNER', file: { id: 'f1', ownerId: 'owner_1' } });
      expect(prismaMock.share.findUnique).not.toHaveBeenCalled();
    });

    it('returns the explicit Share role when one exists', async () => {
      const service = await buildService();
      prismaMock.file.findFirst.mockResolvedValue({ id: 'f1', ownerId: 'owner_1', generalAccess: 'RESTRICTED' });
      prismaMock.share.findUnique.mockResolvedValue({ role: 'EDITOR' });

      const result = await service.getAccess('f1', 'user_2');

      expect(result).toEqual({ role: 'EDITOR', file: expect.objectContaining({ id: 'f1' }) });
      expect(prismaMock.share.findUnique).toHaveBeenCalledWith({
        where: { fileId_userId: { fileId: 'f1', userId: 'user_2' } },
      });
    });

    it('falls back to generalAccessRole when no explicit share exists and generalAccess is ANYONE', async () => {
      const service = await buildService();
      prismaMock.file.findFirst.mockResolvedValue({
        id: 'f1',
        ownerId: 'owner_1',
        generalAccess: 'ANYONE',
        generalAccessRole: 'VIEWER',
      });
      prismaMock.share.findUnique.mockResolvedValue(null);

      const result = await service.getAccess('f1', 'user_3');

      expect(result).toEqual({ role: 'VIEWER', file: expect.objectContaining({ id: 'f1' }) });
    });

    it('returns null when there is no share and generalAccess is RESTRICTED', async () => {
      const service = await buildService();
      prismaMock.file.findFirst.mockResolvedValue({
        id: 'f1',
        ownerId: 'owner_1',
        generalAccess: 'RESTRICTED',
        generalAccessRole: null,
      });
      prismaMock.share.findUnique.mockResolvedValue(null);

      await expect(service.getAccess('f1', 'user_4')).resolves.toBeNull();
    });

    it('resolves OWNER for a soft-deleted file when includeDeleted is true (restore needs this)', async () => {
      const service = await buildService();
      prismaMock.file.findFirst.mockResolvedValue({
        id: 'f1',
        ownerId: 'owner_1',
        deletedAt: new Date(),
      });

      const result = await service.getAccess('f1', 'owner_1', { includeDeleted: true });

      expect(result).toEqual({ role: 'OWNER', file: expect.objectContaining({ id: 'f1' }) });
      expect(prismaMock.file.findFirst).toHaveBeenCalledWith({
        where: { id: 'f1' },
      });
    });

    it('returns null when the file does not exist or is soft-deleted', async () => {
      const service = await buildService();
      prismaMock.file.findFirst.mockResolvedValue(null);

      await expect(service.getAccess('missing', 'user_1')).resolves.toBeNull();
      expect(prismaMock.file.findFirst).toHaveBeenCalledWith({
        where: { id: 'missing', deletedAt: null },
      });
    });
  });

  describe('updateGeneralAccess', () => {
    it('sets generalAccess and generalAccessRole together when turning on ANYONE', async () => {
      const service = await buildService();
      prismaMock.file.update.mockResolvedValue({ id: 'f1', generalAccess: 'ANYONE', generalAccessRole: 'VIEWER' });

      await service.updateGeneralAccess('f1', { generalAccess: 'ANYONE', generalAccessRole: 'VIEWER' } as never);

      expect(prismaMock.file.update).toHaveBeenCalledWith({
        where: { id: 'f1' },
        data: { generalAccess: 'ANYONE', generalAccessRole: 'VIEWER' },
      });
    });

    it('clears generalAccessRole to null when switching back to RESTRICTED', async () => {
      const service = await buildService();
      prismaMock.file.update.mockResolvedValue({ id: 'f1', generalAccess: 'RESTRICTED', generalAccessRole: null });

      await service.updateGeneralAccess('f1', { generalAccess: 'RESTRICTED' } as never);

      expect(prismaMock.file.update).toHaveBeenCalledWith({
        where: { id: 'f1' },
        data: { generalAccess: 'RESTRICTED', generalAccessRole: null },
      });
    });

    it('throws BadRequestException when turning on ANYONE without a generalAccessRole', async () => {
      const service = await buildService();

      await expect(
        service.updateGeneralAccess('f1', { generalAccess: 'ANYONE' } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.file.update).not.toHaveBeenCalled();
    });

    it('creates a GENERAL_ACCESS_CHANGED notification for the owner', async () => {
      const service = await buildService();
      prismaMock.file.update.mockResolvedValue({
        id: 'f1',
        name: 'Q3 Roadmap',
        ownerId: 'owner_1',
        generalAccess: 'ANYONE',
        generalAccessRole: 'VIEWER',
      });

      await service.updateGeneralAccess('f1', { generalAccess: 'ANYONE', generalAccessRole: 'VIEWER' } as never);

      expect(notificationsServiceMock.create).toHaveBeenCalledWith({
        recipientId: 'owner_1',
        actorId: 'owner_1',
        type: 'GENERAL_ACCESS_CHANGED',
        file: { id: 'f1', name: 'Q3 Roadmap' },
      });
    });
  });

  it('listShared returns files with an explicit Share for the caller, with role and owner info', async () => {
    const service = await buildService();
    prismaMock.share.findMany.mockResolvedValue([
      {
        role: 'EDITOR',
        file: {
          id: 'f9',
          name: 'Shared file',
          thumbnailUrl: null,
          updatedAt: new Date('2026-01-01'),
          owner: { name: 'Alice', email: 'alice@x.com' },
        },
      },
    ]);
    prismaMock.star.findMany.mockResolvedValue([]);

    const result = await service.listShared('user_2');

    expect(result).toEqual([
      {
        id: 'f9',
        name: 'Shared file',
        thumbnailUrl: null,
        updatedAt: new Date('2026-01-01'),
        role: 'EDITOR',
        owner: { name: 'Alice', email: 'alice@x.com' },
        starred: false,
      },
    ]);
    expect(prismaMock.share.findMany).toHaveBeenCalledWith({
      where: { userId: 'user_2', file: { deletedAt: null } },
      select: {
        role: true,
        file: {
          select: {
            id: true,
            name: true,
            thumbnailUrl: true,
            updatedAt: true,
            owner: { select: { name: true, email: true } },
          },
        },
      },
      orderBy: { file: { updatedAt: 'desc' } },
    });
  });

  describe('star / unstar / listStarred', () => {
    it('star upserts a Star row keyed on (userId, fileId), idempotently', async () => {
      const service = await buildService();
      prismaMock.star.upsert.mockResolvedValue({ id: 's1', userId: 'user_1', fileId: 'f1' });

      await service.star('user_1', 'f1');

      expect(prismaMock.star.upsert).toHaveBeenCalledWith({
        where: { userId_fileId: { userId: 'user_1', fileId: 'f1' } },
        create: { userId: 'user_1', fileId: 'f1' },
        update: {},
      });
    });

    it('unstar deletes via deleteMany so unstarring an already-unstarred file is a no-op, not an error', async () => {
      const service = await buildService();
      prismaMock.star.deleteMany.mockResolvedValue({ count: 0 });

      await service.unstar('user_1', 'f1');

      expect(prismaMock.star.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user_1', fileId: 'f1' },
      });
    });

    it('listStarred returns only the given user\'s starred, non-deleted files, most recently starred first', async () => {
      const service = await buildService();
      prismaMock.star.findMany.mockResolvedValue([
        { file: { id: 'f1', name: 'A', thumbnailUrl: null, updatedAt: new Date('2026-01-01') } },
      ]);

      const result = await service.listStarred('user_1');

      expect(result).toEqual([
        { id: 'f1', name: 'A', thumbnailUrl: null, updatedAt: new Date('2026-01-01'), starred: true },
      ]);
      expect(prismaMock.star.findMany).toHaveBeenCalledWith({
        where: { userId: 'user_1', file: { deletedAt: null } },
        select: {
          file: {
            select: { id: true, name: true, thumbnailUrl: true, updatedAt: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  it('list marks each file starred/not-starred without an N+1 query (one batched star lookup)', async () => {
    const service = await buildService();
    prismaMock.file.findMany.mockResolvedValue([
      { id: 'f1', name: 'A', thumbnailUrl: null, updatedAt: new Date('2026-01-01') },
      { id: 'f2', name: 'B', thumbnailUrl: null, updatedAt: new Date('2026-01-01') },
    ]);
    prismaMock.star.findMany.mockResolvedValue([{ fileId: 'f1' }]);

    const result = await service.list('owner_1');

    expect(result).toEqual([
      { id: 'f1', name: 'A', thumbnailUrl: null, updatedAt: new Date('2026-01-01'), starred: true },
      { id: 'f2', name: 'B', thumbnailUrl: null, updatedAt: new Date('2026-01-01'), starred: false },
    ]);
    expect(prismaMock.star.findMany).toHaveBeenCalledWith({
      where: { userId: 'owner_1', fileId: { in: ['f1', 'f2'] } },
      select: { fileId: true },
    });
  });

  it('listShared also marks each file starred/not-starred', async () => {
    const service = await buildService();
    prismaMock.share.findMany.mockResolvedValue([
      {
        role: 'EDITOR',
        file: {
          id: 'f9',
          name: 'Shared file',
          thumbnailUrl: null,
          updatedAt: new Date('2026-01-01'),
          owner: { name: 'Alice', email: 'alice@x.com' },
        },
      },
    ]);
    prismaMock.star.findMany.mockResolvedValue([{ fileId: 'f9' }]);

    const result = await service.listShared('user_2');

    expect(result).toEqual([
      {
        id: 'f9',
        name: 'Shared file',
        thumbnailUrl: null,
        updatedAt: new Date('2026-01-01'),
        role: 'EDITOR',
        owner: { name: 'Alice', email: 'alice@x.com' },
        starred: true,
      },
    ]);
  });
});
