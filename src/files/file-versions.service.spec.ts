import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FileVersionsService } from './file-versions.service';
import { PrismaService } from '../prisma/prisma.service';
import { FilesService } from './files.service';

describe('FileVersionsService', () => {
  const prismaMock = {
    fileVersion: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), deleteMany: jest.fn() },
    file: { update: jest.fn(), findUnique: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };

  const filesServiceMock = { notifyThumbnailUpdated: jest.fn() };

  async function buildService() {
    const module = await Test.createTestingModule({
      providers: [
        FileVersionsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: FilesService, useValue: filesServiceMock },
      ],
    }).compile();
    return module.get(FileVersionsService);
  }

  beforeEach(() => jest.clearAllMocks());

  it('save snapshots currentData into a new FileVersion without mutating the file', async () => {
    const service = await buildService();
    const file = { id: 'f1', currentData: { elements: [] }, thumbnailUrl: 'old-thumb.png' };
    prismaMock.fileVersion.create.mockResolvedValue({ id: 'v1' });

    await service.save(file as never, 'Before redesign');

    expect(prismaMock.fileVersion.create).toHaveBeenCalledWith({
      data: { fileId: 'f1', name: 'Before redesign', data: { elements: [] }, thumbnailUrl: 'old-thumb.png', origin: 'MANUAL' },
    });
    expect(prismaMock.file.update).not.toHaveBeenCalled();
  });

  it("save uses a caller-supplied thumbnailUrl instead of the file's current one, when provided", async () => {
    const service = await buildService();
    const file = { id: 'f1', currentData: { elements: [] }, thumbnailUrl: 'old-thumb.png' };
    prismaMock.fileVersion.create.mockResolvedValue({ id: 'v1' });

    await service.save(file as never, 'Before redesign', 'new-thumb.png');

    expect(prismaMock.fileVersion.create).toHaveBeenCalledWith({
      data: { fileId: 'f1', name: 'Before redesign', data: { elements: [] }, thumbnailUrl: 'new-thumb.png', origin: 'MANUAL' },
    });
    expect(prismaMock.file.update).toHaveBeenCalledWith({
      where: { id: 'f1' },
      data: { thumbnailUrl: 'new-thumb.png' },
    });
    expect(filesServiceMock.notifyThumbnailUpdated).toHaveBeenCalledWith('f1', 'new-thumb.png');
  });

  it('save does not broadcast when no caller-supplied thumbnailUrl is given', async () => {
    const service = await buildService();
    const file = { id: 'f1', currentData: { elements: [] }, thumbnailUrl: 'old-thumb.png' };
    prismaMock.fileVersion.create.mockResolvedValue({ id: 'v1' });

    await service.save(file as never, 'Before redesign');

    expect(filesServiceMock.notifyThumbnailUpdated).not.toHaveBeenCalled();
  });

  it('list returns versions for the given fileId without an ownership check', async () => {
    const service = await buildService();
    prismaMock.fileVersion.findMany.mockResolvedValue([{ id: 'v1' }]);

    const result = await service.list('f1');

    expect(result).toEqual([{ id: 'v1' }]);
    expect(prismaMock.fileVersion.findMany).toHaveBeenCalledWith({
      where: { fileId: 'f1' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, thumbnailUrl: true, origin: true, createdAt: true },
    });
  });

  it('restore copies the version data/thumbnail into currentData without deleting the version', async () => {
    const service = await buildService();
    const file = { id: 'f1' };
    prismaMock.fileVersion.findFirst.mockResolvedValue({
      id: 'v1',
      data: { elements: ['restored'] },
      thumbnailUrl: 'v1-thumb.png',
    });
    prismaMock.file.update.mockResolvedValue({ id: 'f1', currentData: { elements: ['restored'] } });

    await service.restore(file as never, 'v1');

    expect(prismaMock.file.update).toHaveBeenCalledWith({
      where: { id: 'f1' },
      data: { currentData: { elements: ['restored'] }, thumbnailUrl: 'v1-thumb.png' },
    });
  });

  it('restore throws NotFoundException when the version does not belong to the file', async () => {
    const service = await buildService();
    prismaMock.fileVersion.findFirst.mockResolvedValue(null);

    await expect(service.restore({ id: 'f1' } as never, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('restore broadcasts a thumbnail update when the restored version has one', async () => {
    const service = await buildService();
    const file = { id: 'f1' };
    prismaMock.fileVersion.findFirst.mockResolvedValue({
      id: 'v1',
      data: { elements: ['restored'] },
      thumbnailUrl: 'v1-thumb.png',
    });
    prismaMock.file.update.mockResolvedValue({ id: 'f1', thumbnailUrl: 'v1-thumb.png' });

    await service.restore(file as never, 'v1');

    expect(filesServiceMock.notifyThumbnailUpdated).toHaveBeenCalledWith('f1', 'v1-thumb.png');
  });

  it('restore does not broadcast when the restored version had no thumbnail', async () => {
    const service = await buildService();
    const file = { id: 'f1' };
    prismaMock.fileVersion.findFirst.mockResolvedValue({
      id: 'v1',
      data: { elements: ['restored'] },
      thumbnailUrl: null,
    });
    prismaMock.file.update.mockResolvedValue({ id: 'f1', thumbnailUrl: null });

    await service.restore(file as never, 'v1');

    expect(filesServiceMock.notifyThumbnailUpdated).not.toHaveBeenCalled();
  });

  describe('sweepIdleFiles', () => {
    beforeEach(() => {
      prismaMock.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prismaMock));
    });

    it('creates an AUTO version for each file the query returns, and prunes retention for each', async () => {
      const service = await buildService();
      prismaMock.$queryRaw.mockResolvedValue([{ id: 'f1' }, { id: 'f2' }]);
      prismaMock.file.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve({ id: where.id, currentData: { elements: [] }, thumbnailUrl: `thumb-${where.id}.png` }),
      );
      prismaMock.fileVersion.create.mockResolvedValue({ id: 'v-new' });
      prismaMock.fileVersion.findMany.mockResolvedValue([{ id: 'v-new' }]);

      await service.sweepIdleFiles(5 * 60_000);

      expect(prismaMock.fileVersion.create).toHaveBeenCalledTimes(2);
      expect(prismaMock.fileVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ fileId: 'f1', origin: 'AUTO', thumbnailUrl: 'thumb-f1.png' }),
      });
      expect(prismaMock.fileVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ fileId: 'f2', origin: 'AUTO', thumbnailUrl: 'thumb-f2.png' }),
      });
    });

    it("names the auto-created version starting with 'Auto-saved'", async () => {
      const service = await buildService();
      prismaMock.$queryRaw.mockResolvedValue([{ id: 'f1' }]);
      prismaMock.file.findUnique.mockResolvedValue({ id: 'f1', currentData: {}, thumbnailUrl: null });
      prismaMock.fileVersion.create.mockResolvedValue({ id: 'v1' });
      prismaMock.fileVersion.findMany.mockResolvedValue([{ id: 'v1' }]);

      await service.sweepIdleFiles(5 * 60_000);

      const call = prismaMock.fileVersion.create.mock.calls[0][0];
      expect(call.data.name).toMatch(/^Auto-saved —/);
    });

    it('prunes AUTO versions past the retention cap, oldest first, leaving exactly 20', async () => {
      const service = await buildService();
      prismaMock.$queryRaw.mockResolvedValue([{ id: 'f1' }]);
      prismaMock.file.findUnique.mockResolvedValue({ id: 'f1', currentData: {}, thumbnailUrl: null });
      prismaMock.fileVersion.create.mockResolvedValue({ id: 'v-new' });
      const existing = Array.from({ length: 20 }, (_, i) => ({ id: `v-old-${i}` }));
      prismaMock.fileVersion.findMany.mockResolvedValue([{ id: 'v-new' }, ...existing]);

      await service.sweepIdleFiles(5 * 60_000);

      expect(prismaMock.fileVersion.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['v-old-19'] } },
      });
    });

    it('does not prune when at or under the retention cap', async () => {
      const service = await buildService();
      prismaMock.$queryRaw.mockResolvedValue([{ id: 'f1' }]);
      prismaMock.file.findUnique.mockResolvedValue({ id: 'f1', currentData: {}, thumbnailUrl: null });
      prismaMock.fileVersion.create.mockResolvedValue({ id: 'v-new' });
      const existing = Array.from({ length: 19 }, (_, i) => ({ id: `v-old-${i}` }));
      prismaMock.fileVersion.findMany.mockResolvedValue([{ id: 'v-new' }, ...existing]);

      await service.sweepIdleFiles(5 * 60_000);

      expect(prismaMock.fileVersion.deleteMany).not.toHaveBeenCalled();
    });

    it('only ever queries/prunes AUTO-origin versions, never MANUAL', async () => {
      const service = await buildService();
      prismaMock.$queryRaw.mockResolvedValue([{ id: 'f1' }]);
      prismaMock.file.findUnique.mockResolvedValue({ id: 'f1', currentData: {}, thumbnailUrl: null });
      prismaMock.fileVersion.create.mockResolvedValue({ id: 'v-new' });
      prismaMock.fileVersion.findMany.mockResolvedValue([{ id: 'v-new' }]);

      await service.sweepIdleFiles(5 * 60_000);

      expect(prismaMock.fileVersion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { fileId: 'f1', origin: 'AUTO' } }),
      );
    });

    it('continues sweeping remaining files when one file fails (isolated per-file failure)', async () => {
      const service = await buildService();
      prismaMock.$queryRaw.mockResolvedValue([{ id: 'f1' }, { id: 'f2' }]);
      prismaMock.file.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === 'f1') return Promise.reject(new Error('boom'));
        return Promise.resolve({ id: 'f2', currentData: {}, thumbnailUrl: null });
      });
      prismaMock.fileVersion.create.mockResolvedValue({ id: 'v-new' });
      prismaMock.fileVersion.findMany.mockResolvedValue([{ id: 'v-new' }]);

      await expect(service.sweepIdleFiles(5 * 60_000)).resolves.toBeUndefined();

      expect(prismaMock.fileVersion.create).toHaveBeenCalledTimes(1);
      expect(prismaMock.fileVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ fileId: 'f2' }),
      });
    });

    it('skips a file that no longer exists by the time the transaction runs (race with a real delete)', async () => {
      const service = await buildService();
      prismaMock.$queryRaw.mockResolvedValue([{ id: 'f1' }]);
      prismaMock.file.findUnique.mockResolvedValue(null);

      await service.sweepIdleFiles(5 * 60_000);

      expect(prismaMock.fileVersion.create).not.toHaveBeenCalled();
    });
  });
});
