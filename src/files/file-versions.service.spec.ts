import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FileVersionsService } from './file-versions.service';
import { PrismaService } from '../prisma/prisma.service';

describe('FileVersionsService', () => {
  const prismaMock = {
    fileVersion: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
    file: { update: jest.fn() },
  };

  async function buildService() {
    const module = await Test.createTestingModule({
      providers: [FileVersionsService, { provide: PrismaService, useValue: prismaMock }],
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
      data: { fileId: 'f1', name: 'Before redesign', data: { elements: [] }, thumbnailUrl: 'old-thumb.png' },
    });
    expect(prismaMock.file.update).not.toHaveBeenCalled();
  });

  it("save uses a caller-supplied thumbnailUrl instead of the file's current one, when provided", async () => {
    const service = await buildService();
    const file = { id: 'f1', currentData: { elements: [] }, thumbnailUrl: 'old-thumb.png' };
    prismaMock.fileVersion.create.mockResolvedValue({ id: 'v1' });

    await service.save(file as never, 'Before redesign', 'new-thumb.png');

    expect(prismaMock.fileVersion.create).toHaveBeenCalledWith({
      data: { fileId: 'f1', name: 'Before redesign', data: { elements: [] }, thumbnailUrl: 'new-thumb.png' },
    });
    expect(prismaMock.file.update).toHaveBeenCalledWith({
      where: { id: 'f1' },
      data: { thumbnailUrl: 'new-thumb.png' },
    });
  });

  it('list returns versions for the given fileId without an ownership check', async () => {
    const service = await buildService();
    prismaMock.fileVersion.findMany.mockResolvedValue([{ id: 'v1' }]);

    const result = await service.list('f1');

    expect(result).toEqual([{ id: 'v1' }]);
    expect(prismaMock.fileVersion.findMany).toHaveBeenCalledWith({
      where: { fileId: 'f1' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, thumbnailUrl: true, createdAt: true },
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
});
