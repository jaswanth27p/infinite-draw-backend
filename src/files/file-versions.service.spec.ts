import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FileVersionsService } from './file-versions.service';
import { FilesService } from './files.service';
import { PrismaService } from '../prisma/prisma.service';

describe('FileVersionsService', () => {
  const prismaMock = {
    fileVersion: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
    file: { update: jest.fn() },
  };
  const filesServiceMock = { getOwned: jest.fn() };

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

  it('save snapshots the file\'s current data without mutating it', async () => {
    const service = await buildService();
    filesServiceMock.getOwned.mockResolvedValue({
      id: 'f1',
      currentData: { elements: [] },
      thumbnailUrl: 'thumb.png',
    });
    prismaMock.fileVersion.create.mockResolvedValue({ id: 'v1' });

    const result = await service.save('f1', 'owner_1', 'Before redesign');

    expect(result).toEqual({ id: 'v1' });
    expect(prismaMock.fileVersion.create).toHaveBeenCalledWith({
      data: {
        fileId: 'f1',
        name: 'Before redesign',
        data: { elements: [] },
        thumbnailUrl: 'thumb.png',
      },
    });
    expect(prismaMock.file.update).not.toHaveBeenCalled();
  });

  it('save uses a caller-supplied thumbnailUrl instead of the file\'s current one, when provided', async () => {
    const service = await buildService();
    filesServiceMock.getOwned.mockResolvedValue({
      id: 'f1',
      currentData: { elements: [] },
      thumbnailUrl: 'old-thumb.png',
    });
    prismaMock.fileVersion.create.mockResolvedValue({ id: 'v1' });

    await service.save('f1', 'owner_1', 'Before redesign', 'new-thumb.png');

    expect(prismaMock.fileVersion.create).toHaveBeenCalledWith({
      data: {
        fileId: 'f1',
        name: 'Before redesign',
        data: { elements: [] },
        thumbnailUrl: 'new-thumb.png',
      },
    });
  });

  it('save writes a caller-supplied thumbnailUrl through to the File row, without touching currentData', async () => {
    const service = await buildService();
    filesServiceMock.getOwned.mockResolvedValue({
      id: 'f1',
      currentData: { elements: [] },
      thumbnailUrl: 'old-thumb.png',
    });
    prismaMock.fileVersion.create.mockResolvedValue({ id: 'v1' });

    await service.save('f1', 'owner_1', 'Before redesign', 'new-thumb.png');

    expect(prismaMock.file.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.file.update).toHaveBeenCalledWith({
      where: { id: 'f1' },
      data: { thumbnailUrl: 'new-thumb.png' },
    });
  });

  it('save does not touch the File row at all when no thumbnailUrl is supplied', async () => {
    const service = await buildService();
    filesServiceMock.getOwned.mockResolvedValue({
      id: 'f1',
      currentData: { elements: [] },
      thumbnailUrl: 'existing-thumb.png',
    });
    prismaMock.fileVersion.create.mockResolvedValue({ id: 'v1' });

    await service.save('f1', 'owner_1', 'Before redesign');

    expect(prismaMock.file.update).not.toHaveBeenCalled();
  });

  it('list rejects when the file isn\'t owned by the caller', async () => {
    const service = await buildService();
    filesServiceMock.getOwned.mockRejectedValue(new NotFoundException());

    await expect(service.list('f1', 'owner_2')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('restore copies the version\'s data into the file\'s currentData', async () => {
    const service = await buildService();
    filesServiceMock.getOwned.mockResolvedValue({ id: 'f1' });
    prismaMock.fileVersion.findFirst.mockResolvedValue({
      id: 'v1',
      fileId: 'f1',
      data: { elements: ['restored'] },
      thumbnailUrl: 'old-thumb.png',
    });
    prismaMock.file.update.mockResolvedValue({ id: 'f1', currentData: { elements: ['restored'] } });

    const result = await service.restore('f1', 'v1', 'owner_1');

    expect(result).toEqual({ id: 'f1', currentData: { elements: ['restored'] } });
    expect(prismaMock.file.update).toHaveBeenCalledWith({
      where: { id: 'f1' },
      data: { currentData: { elements: ['restored'] }, thumbnailUrl: 'old-thumb.png' },
    });
  });

  it('restore throws NotFoundException when the version doesn\'t belong to the file', async () => {
    const service = await buildService();
    filesServiceMock.getOwned.mockResolvedValue({ id: 'f1' });
    prismaMock.fileVersion.findFirst.mockResolvedValue(null);

    await expect(service.restore('f1', 'v_missing', 'owner_1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
