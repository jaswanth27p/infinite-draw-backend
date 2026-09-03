import { BadRequestException, NotFoundException } from '@nestjs/common';
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
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
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
  const notificationsServiceMock = { create: jest.fn(), notifyThumbnailUpdated: jest.fn() };

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

    expect(result).toEqual({ items: [{ id: 'f1', starred: false }], nextCursor: null });
    expect(prismaMock.file.findMany).toHaveBeenCalledWith({
      where: { ownerId: 'owner_1', deletedAt: null },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 31,
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

  it('update broadcasts a thumbnail update to the owner and every shared user when thumbnailUrl changes', async () => {
    const service = await buildService();
    prismaMock.file.update.mockResolvedValue({ id: 'f5', thumbnailUrl: 'new.png' });
    prismaMock.file.findUnique.mockResolvedValue({ ownerId: 'owner_1' });
    prismaMock.share.findMany.mockResolvedValue([{ userId: 'user_2' }, { userId: 'user_3' }]);

    await service.update('f5', { thumbnailUrl: 'new.png' });

    expect(prismaMock.share.findMany).toHaveBeenCalledWith({
      where: { fileId: 'f5' },
      select: { userId: true },
    });
    expect(notificationsServiceMock.notifyThumbnailUpdated).toHaveBeenCalledWith(
      ['owner_1', 'user_2', 'user_3'],
      'f5',
      'new.png',
      undefined,
    );
  });

  it('update writes and broadcasts both thumbnailUrl and thumbnailUrlDark when both are given', async () => {
    const service = await buildService();
    prismaMock.file.update.mockResolvedValue({ id: 'f5', thumbnailUrl: 'new.png', thumbnailUrlDark: 'new-dark.png' });
    prismaMock.file.findUnique.mockResolvedValue({ ownerId: 'owner_1' });
    prismaMock.share.findMany.mockResolvedValue([]);

    await service.update('f5', { thumbnailUrl: 'new.png', thumbnailUrlDark: 'new-dark.png' });

    expect(prismaMock.file.update).toHaveBeenCalledWith({
      where: { id: 'f5' },
      data: { thumbnailUrl: 'new.png', thumbnailUrlDark: 'new-dark.png' },
    });
    expect(notificationsServiceMock.notifyThumbnailUpdated).toHaveBeenCalledWith(
      ['owner_1'],
      'f5',
      'new.png',
      'new-dark.png',
    );
  });

  it('update does not broadcast when thumbnailUrl is not part of the patch', async () => {
    const service = await buildService();
    prismaMock.file.update.mockResolvedValue({ id: 'f5', name: 'Renamed' });

    await service.update('f5', { name: 'Renamed' });

    expect(notificationsServiceMock.notifyThumbnailUpdated).not.toHaveBeenCalled();
    expect(prismaMock.file.findUnique).not.toHaveBeenCalled();
  });

  it('notifyThumbnailUpdated does nothing if the file no longer exists', async () => {
    const service = await buildService();
    prismaMock.file.findUnique.mockResolvedValue(null);

    await service.notifyThumbnailUpdated('gone', 'x.png');

    expect(prismaMock.share.findMany).not.toHaveBeenCalled();
    expect(notificationsServiceMock.notifyThumbnailUpdated).not.toHaveBeenCalled();
  });

  it('notifyThumbnailUpdated swallows a failure in the audience lookup instead of throwing', async () => {
    const service = await buildService();
    prismaMock.file.findUnique.mockRejectedValue(new Error('connection reset'));

    await expect(service.notifyThumbnailUpdated('f1', 'x.png')).resolves.toBeUndefined();
    expect(notificationsServiceMock.notifyThumbnailUpdated).not.toHaveBeenCalled();
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

    it('resolves anonymous access as VIEWER when generalAccess is ANYONE, regardless of generalAccessRole', async () => {
      const service = await buildService();
      prismaMock.file.findFirst.mockResolvedValue({
        id: 'f1',
        ownerId: 'owner_1',
        generalAccess: 'ANYONE',
        generalAccessRole: 'EDITOR',
      });

      const result = await service.getAccess('f1', undefined);

      expect(result).toEqual({ role: 'VIEWER', file: expect.objectContaining({ id: 'f1' }) });
      expect(prismaMock.share.findUnique).not.toHaveBeenCalled();
    });

    it('returns null for anonymous access when generalAccess is RESTRICTED', async () => {
      const service = await buildService();
      prismaMock.file.findFirst.mockResolvedValue({
        id: 'f1',
        ownerId: 'owner_1',
        generalAccess: 'RESTRICTED',
        generalAccessRole: null,
      });

      await expect(service.getAccess('f1', undefined)).resolves.toBeNull();
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
        id: 's1',
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

    expect(result).toEqual({
      items: [
        {
          id: 'f9',
          name: 'Shared file',
          thumbnailUrl: null,
          updatedAt: new Date('2026-01-01'),
          role: 'EDITOR',
          owner: { name: 'Alice', email: 'alice@x.com' },
          starred: false,
        },
      ],
      nextCursor: null,
    });
    expect(prismaMock.share.findMany).toHaveBeenCalledWith({
      where: { userId: 'user_2', file: { deletedAt: null } },
      select: {
        id: true,
        role: true,
        file: {
          select: {
            id: true,
            name: true,
            thumbnailUrl: true,
            thumbnailUrlDark: true,
            updatedAt: true,
            owner: { select: { name: true, email: true } },
          },
        },
      },
      orderBy: [{ file: { updatedAt: 'desc' } }, { id: 'desc' }],
      take: 31,
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
        { id: 'st1', file: { id: 'f1', name: 'A', thumbnailUrl: null, updatedAt: new Date('2026-01-01') } },
      ]);

      const result = await service.listStarred('user_1');

      expect(result).toEqual({
        items: [
          { id: 'f1', name: 'A', thumbnailUrl: null, updatedAt: new Date('2026-01-01'), starred: true },
        ],
        nextCursor: null,
      });
      expect(prismaMock.star.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user_1',
          file: {
            deletedAt: null,
            OR: [
              { ownerId: 'user_1' },
              { shares: { some: { userId: 'user_1' } } },
              { generalAccess: 'ANYONE', generalAccessRole: { not: null } },
            ],
          },
        },
        select: {
          id: true,
          file: {
            select: { id: true, name: true, thumbnailUrl: true, thumbnailUrlDark: true, updatedAt: true },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 31,
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

    expect(result).toEqual({
      items: [
        { id: 'f1', name: 'A', thumbnailUrl: null, updatedAt: new Date('2026-01-01'), starred: true },
        { id: 'f2', name: 'B', thumbnailUrl: null, updatedAt: new Date('2026-01-01'), starred: false },
      ],
      nextCursor: null,
    });
    expect(prismaMock.star.findMany).toHaveBeenCalledWith({
      where: { userId: 'owner_1', fileId: { in: ['f1', 'f2'] } },
      select: { fileId: true },
    });
  });

  it('listShared also marks each file starred/not-starred', async () => {
    const service = await buildService();
    prismaMock.share.findMany.mockResolvedValue([
      {
        id: 's1',
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

    expect(result).toEqual({
      items: [
        {
          id: 'f9',
          name: 'Shared file',
          thumbnailUrl: null,
          updatedAt: new Date('2026-01-01'),
          role: 'EDITOR',
          owner: { name: 'Alice', email: 'alice@x.com' },
          starred: true,
        },
      ],
      nextCursor: null,
    });
  });

  describe('listTrash / permanentDelete', () => {
    it("listTrash returns only the owner's soft-deleted files, most recently deleted first", async () => {
      const service = await buildService();
      prismaMock.file.findMany.mockResolvedValue([
        { id: 'f1', name: 'A', thumbnailUrl: null, updatedAt: new Date('2026-01-01'), deletedAt: new Date('2026-01-02') },
      ]);

      const result = await service.listTrash('owner_1');

      expect(result).toEqual({
        items: [
          { id: 'f1', name: 'A', thumbnailUrl: null, updatedAt: new Date('2026-01-01'), deletedAt: new Date('2026-01-02') },
        ],
        nextCursor: null,
      });
      expect(prismaMock.file.findMany).toHaveBeenCalledWith({
        where: { ownerId: 'owner_1', deletedAt: { not: null } },
        orderBy: [{ deletedAt: 'desc' }, { id: 'desc' }],
        take: 31,
        select: expect.objectContaining({
          id: true,
          name: true,
          thumbnailUrl: true,
          updatedAt: true,
          deletedAt: true,
        }),
      });
    });

    it('permanentDelete hard-deletes the file row only if it is actually soft-deleted (cascades handle versions/shares/messages/stars) without re-checking ownership (guard-gated via OWNER + AllowDeleted)', async () => {
      const service = await buildService();
      prismaMock.file.deleteMany.mockResolvedValue({ count: 1 });

      await service.permanentDelete('f1');

      expect(prismaMock.file.deleteMany).toHaveBeenCalledWith({
        where: { id: 'f1', deletedAt: { not: null } },
      });
      expect(prismaMock.file.findFirst).not.toHaveBeenCalled();
    });

    it('permanentDelete throws NotFoundException instead of silently no-op-ing when the file is not actually in the trash — @AllowDeleted() lets a live file resolve access, so the deletedAt filter here is the only thing stopping a live file from being destroyed', async () => {
      const service = await buildService();
      prismaMock.file.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.permanentDelete('f1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('pagination', () => {
    describe('list', () => {
      it('slices off the extra row fetched via take+1 and sets nextCursor to the last item on the page', async () => {
        const service = await buildService();
        prismaMock.file.findMany.mockResolvedValue([
          { id: 'f1', name: 'A', thumbnailUrl: null, updatedAt: new Date('2026-01-02') },
          { id: 'f2', name: 'B', thumbnailUrl: null, updatedAt: new Date('2026-01-01') },
        ]);
        prismaMock.star.findMany.mockResolvedValue([]);

        const result = await service.list('owner_1', undefined, 1);

        expect(result.items).toEqual([
          { id: 'f1', name: 'A', thumbnailUrl: null, updatedAt: new Date('2026-01-02'), starred: false },
        ]);
        expect(result.nextCursor).toBe('f1');
      });

      it('returns nextCursor null when there is no extra row beyond the requested take', async () => {
        const service = await buildService();
        prismaMock.file.findMany.mockResolvedValue([
          { id: 'f1', name: 'A', thumbnailUrl: null, updatedAt: new Date('2026-01-02') },
        ]);
        prismaMock.star.findMany.mockResolvedValue([]);

        const result = await service.list('owner_1', undefined, 1);

        expect(result.nextCursor).toBeNull();
      });

      it('passes the caller-supplied cursor through to findMany as cursor/skip', async () => {
        const service = await buildService();
        prismaMock.file.findMany.mockResolvedValue([]);
        prismaMock.star.findMany.mockResolvedValue([]);

        await service.list('owner_1', 'f1', 1);

        expect(prismaMock.file.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ cursor: { id: 'f1' }, skip: 1 }),
        );
      });
    });

    describe('listShared', () => {
      const shareRow = (id: string, fileId: string, updatedAt: Date) => ({
        id,
        role: 'EDITOR',
        file: {
          id: fileId,
          name: 'Shared file',
          thumbnailUrl: null,
          updatedAt,
          owner: { name: 'Alice', email: 'alice@x.com' },
        },
      });

      it('slices off the extra row fetched via take+1 and sets nextCursor to the last Share row id on the page', async () => {
        const service = await buildService();
        prismaMock.share.findMany.mockResolvedValue([
          shareRow('s1', 'f1', new Date('2026-01-02')),
          shareRow('s2', 'f2', new Date('2026-01-01')),
        ]);
        prismaMock.star.findMany.mockResolvedValue([]);

        const result = await service.listShared('user_2', undefined, 1);

        expect(result.items).toHaveLength(1);
        expect(result.items[0].id).toBe('f1');
        expect(result.nextCursor).toBe('s1');
      });

      it('returns nextCursor null when there is no extra row beyond the requested take', async () => {
        const service = await buildService();
        prismaMock.share.findMany.mockResolvedValue([shareRow('s1', 'f1', new Date('2026-01-02'))]);
        prismaMock.star.findMany.mockResolvedValue([]);

        const result = await service.listShared('user_2', undefined, 1);

        expect(result.nextCursor).toBeNull();
      });

      it('passes the caller-supplied cursor through to findMany as cursor/skip', async () => {
        const service = await buildService();
        prismaMock.share.findMany.mockResolvedValue([]);
        prismaMock.star.findMany.mockResolvedValue([]);

        await service.listShared('user_2', 's1', 1);

        expect(prismaMock.share.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ cursor: { id: 's1' }, skip: 1 }),
        );
      });
    });

    describe('listStarred', () => {
      const starRow = (id: string, fileId: string, updatedAt: Date) => ({
        id,
        file: { id: fileId, name: 'A', thumbnailUrl: null, updatedAt },
      });

      it('slices off the extra row fetched via take+1 and sets nextCursor to the last Star row id on the page', async () => {
        const service = await buildService();
        prismaMock.star.findMany.mockResolvedValue([
          starRow('st1', 'f1', new Date('2026-01-02')),
          starRow('st2', 'f2', new Date('2026-01-01')),
        ]);

        const result = await service.listStarred('user_1', undefined, 1);

        expect(result.items).toEqual([
          { id: 'f1', name: 'A', thumbnailUrl: null, updatedAt: new Date('2026-01-02'), starred: true },
        ]);
        expect(result.nextCursor).toBe('st1');
      });

      it('returns nextCursor null when there is no extra row beyond the requested take', async () => {
        const service = await buildService();
        prismaMock.star.findMany.mockResolvedValue([starRow('st1', 'f1', new Date('2026-01-02'))]);

        const result = await service.listStarred('user_1', undefined, 1);

        expect(result.nextCursor).toBeNull();
      });

      it('passes the caller-supplied cursor through to findMany as cursor/skip', async () => {
        const service = await buildService();
        prismaMock.star.findMany.mockResolvedValue([]);

        await service.listStarred('user_1', 'st1', 1);

        expect(prismaMock.star.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ cursor: { id: 'st1' }, skip: 1 }),
        );
      });
    });

    describe('listTrash', () => {
      it('slices off the extra row fetched via take+1 and sets nextCursor to the last item on the page', async () => {
        const service = await buildService();
        prismaMock.file.findMany.mockResolvedValue([
          { id: 'f1', name: 'A', thumbnailUrl: null, updatedAt: new Date('2026-01-02'), deletedAt: new Date('2026-01-03') },
          { id: 'f2', name: 'B', thumbnailUrl: null, updatedAt: new Date('2026-01-01'), deletedAt: new Date('2026-01-02') },
        ]);

        const result = await service.listTrash('owner_1', undefined, 1);

        expect(result.items).toEqual([
          { id: 'f1', name: 'A', thumbnailUrl: null, updatedAt: new Date('2026-01-02'), deletedAt: new Date('2026-01-03') },
        ]);
        expect(result.nextCursor).toBe('f1');
      });

      it('returns nextCursor null when there is no extra row beyond the requested take', async () => {
        const service = await buildService();
        prismaMock.file.findMany.mockResolvedValue([
          { id: 'f1', name: 'A', thumbnailUrl: null, updatedAt: new Date('2026-01-02'), deletedAt: new Date('2026-01-03') },
        ]);

        const result = await service.listTrash('owner_1', undefined, 1);

        expect(result.nextCursor).toBeNull();
      });

      it('passes the caller-supplied cursor through to findMany as cursor/skip', async () => {
        const service = await buildService();
        prismaMock.file.findMany.mockResolvedValue([]);

        await service.listTrash('owner_1', 'f1', 1);

        expect(prismaMock.file.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ cursor: { id: 'f1' }, skip: 1 }),
        );
      });
    });
  });

  describe('search filtering (q)', () => {
    it('list filters by name substring, case-insensitively, when q is provided', async () => {
      const service = await buildService();
      prismaMock.file.findMany.mockResolvedValue([]);
      prismaMock.star.findMany.mockResolvedValue([]);

      await service.list('owner_1', undefined, 30, 'roadmap');

      expect(prismaMock.file.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ownerId: 'owner_1', deletedAt: null, name: { contains: 'roadmap', mode: 'insensitive' } },
        }),
      );
    });

    it('list omits the name filter entirely when q is not provided (existing behavior unchanged)', async () => {
      const service = await buildService();
      prismaMock.file.findMany.mockResolvedValue([]);
      prismaMock.star.findMany.mockResolvedValue([]);

      await service.list('owner_1');

      expect(prismaMock.file.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { ownerId: 'owner_1', deletedAt: null } }),
      );
    });

    it('listStarred filters by name substring, case-insensitively, when q is provided', async () => {
      const service = await buildService();
      prismaMock.star.findMany.mockResolvedValue([]);

      await service.listStarred('user_1', undefined, 30, 'roadmap');

      expect(prismaMock.star.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user_1',
            file: {
              deletedAt: null,
              OR: [
                { ownerId: 'user_1' },
                { shares: { some: { userId: 'user_1' } } },
                { generalAccess: 'ANYONE', generalAccessRole: { not: null } },
              ],
              name: { contains: 'roadmap', mode: 'insensitive' },
            },
          },
        }),
      );
    });

    it('listStarred omits the name filter entirely when q is not provided', async () => {
      const service = await buildService();
      prismaMock.star.findMany.mockResolvedValue([]);

      await service.listStarred('user_1');

      expect(prismaMock.star.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user_1',
            file: {
              deletedAt: null,
              OR: [
                { ownerId: 'user_1' },
                { shares: { some: { userId: 'user_1' } } },
                { generalAccess: 'ANYONE', generalAccessRole: { not: null } },
              ],
            },
          },
        }),
      );
    });

    it('listTrash filters by name substring, case-insensitively, when q is provided', async () => {
      const service = await buildService();
      prismaMock.file.findMany.mockResolvedValue([]);

      await service.listTrash('owner_1', undefined, 30, 'roadmap');

      expect(prismaMock.file.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ownerId: 'owner_1', deletedAt: { not: null }, name: { contains: 'roadmap', mode: 'insensitive' } },
        }),
      );
    });

    it('listTrash omits the name filter entirely when q is not provided', async () => {
      const service = await buildService();
      prismaMock.file.findMany.mockResolvedValue([]);

      await service.listTrash('owner_1');

      expect(prismaMock.file.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { ownerId: 'owner_1', deletedAt: { not: null } } }),
      );
    });
  });
});
