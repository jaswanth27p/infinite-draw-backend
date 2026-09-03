import { ThumbnailSweepService } from './thumbnail-sweep.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';

describe('ThumbnailSweepService', () => {
  const prismaMock = {
    file: { findMany: jest.fn() },
    fileVersion: { findMany: jest.fn() },
  };
  const storageMock = {
    listThumbnailKeys: jest.fn(),
    deleteObject: jest.fn(),
    keyFromPublicUrl: jest.fn((url: string) => url.replace('http://minio/bucket/', '')),
  };

  const buildService = () =>
    new ThumbnailSweepService(
      prismaMock as unknown as PrismaService,
      storageMock as unknown as StorageService,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    storageMock.keyFromPublicUrl.mockImplementation((url: string) =>
      url.replace('http://minio/bucket/', ''),
    );
  });

  it('deletes objects past the grace period that no File or FileVersion references', async () => {
    const now = Date.now();
    storageMock.listThumbnailKeys.mockResolvedValue([
      { key: 'thumbnails/orphan.png', lastModified: new Date(now - 10_000) },
      { key: 'thumbnails/live.png', lastModified: new Date(now - 10_000) },
      { key: 'thumbnails/too-recent.png', lastModified: new Date(now - 1_000) },
    ]);
    prismaMock.file.findMany.mockResolvedValue([
      { thumbnailUrl: 'http://minio/bucket/thumbnails/live.png' },
    ]);
    prismaMock.fileVersion.findMany.mockResolvedValue([]);

    const deleted = await buildService().sweep(5_000);

    expect(deleted).toBe(1);
    expect(storageMock.deleteObject).toHaveBeenCalledTimes(1);
    expect(storageMock.deleteObject).toHaveBeenCalledWith('thumbnails/orphan.png');
  });

  it('never deletes a key still referenced by a FileVersion, even if the File moved on', async () => {
    storageMock.listThumbnailKeys.mockResolvedValue([
      { key: 'thumbnails/history.png', lastModified: new Date(0) },
    ]);
    prismaMock.file.findMany.mockResolvedValue([]);
    prismaMock.fileVersion.findMany.mockResolvedValue([
      { thumbnailUrl: 'http://minio/bucket/thumbnails/history.png' },
    ]);

    const deleted = await buildService().sweep(5_000);

    expect(deleted).toBe(0);
    expect(storageMock.deleteObject).not.toHaveBeenCalled();
  });

  it('treats a dark-theme-only key as referenced (does not orphan-sweep it)', async () => {
    storageMock.listThumbnailKeys.mockResolvedValue([
      { key: 'thumbnails/dark-only.png', lastModified: new Date(0) },
    ]);
    prismaMock.file.findMany.mockResolvedValue([
      { thumbnailUrl: null, thumbnailUrlDark: 'http://minio/bucket/thumbnails/dark-only.png' },
    ]);
    prismaMock.fileVersion.findMany.mockResolvedValue([]);

    const deleted = await buildService().sweep(5_000);

    expect(deleted).toBe(0);
    expect(storageMock.deleteObject).not.toHaveBeenCalled();
  });

  it('queries both File and FileVersion with an OR filter covering both URL columns', async () => {
    storageMock.listThumbnailKeys.mockResolvedValue([]);
    prismaMock.file.findMany.mockResolvedValue([]);
    prismaMock.fileVersion.findMany.mockResolvedValue([]);

    await buildService().sweep(5_000);

    expect(prismaMock.file.findMany).toHaveBeenCalledWith({
      where: { OR: [{ thumbnailUrl: { not: null } }, { thumbnailUrlDark: { not: null } }] },
      select: { thumbnailUrl: true, thumbnailUrlDark: true },
    });
    expect(prismaMock.fileVersion.findMany).toHaveBeenCalledWith({
      where: { OR: [{ thumbnailUrl: { not: null } }, { thumbnailUrlDark: { not: null } }] },
      select: { thumbnailUrl: true, thumbnailUrlDark: true },
    });
  });

  it('does nothing when nothing is orphaned', async () => {
    storageMock.listThumbnailKeys.mockResolvedValue([]);
    prismaMock.file.findMany.mockResolvedValue([]);
    prismaMock.fileVersion.findMany.mockResolvedValue([]);

    const deleted = await buildService().sweep(5_000);

    expect(deleted).toBe(0);
    expect(storageMock.deleteObject).not.toHaveBeenCalled();
  });
});
