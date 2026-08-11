import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FilesService } from './files.service';
import { PrismaService } from '../prisma/prisma.service';

describe('FilesService', () => {
  const prismaMock = {
    file: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  async function buildService() {
    const module = await Test.createTestingModule({
      providers: [
        FilesService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    return module.get(FilesService);
  }

  beforeEach(() => jest.clearAllMocks());

  it("lists only the owner's non-deleted files", async () => {
    const service = await buildService();
    prismaMock.file.findMany.mockResolvedValue([{ id: 'f1' }]);

    const result = await service.list('owner_1');

    expect(result).toEqual([{ id: 'f1' }]);
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

  it('getOwned returns the file when owned and not deleted', async () => {
    const service = await buildService();
    prismaMock.file.findFirst.mockResolvedValue({
      id: 'f3',
      ownerId: 'owner_1',
    });

    await expect(service.getOwned('f3', 'owner_1')).resolves.toEqual({
      id: 'f3',
      ownerId: 'owner_1',
    });
    expect(prismaMock.file.findFirst).toHaveBeenCalledWith({
      where: { id: 'f3', ownerId: 'owner_1', deletedAt: null },
    });
  });

  it('getOwned throws NotFoundException when missing, deleted, or not owned', async () => {
    const service = await buildService();
    prismaMock.file.findFirst.mockResolvedValue(null);

    await expect(service.getOwned('f4', 'owner_1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("softDelete sets deletedAt only for the owner's file", async () => {
    const service = await buildService();
    prismaMock.file.findFirst.mockResolvedValue({
      id: 'f5',
      ownerId: 'owner_1',
    });
    prismaMock.file.update.mockResolvedValue({
      id: 'f5',
      deletedAt: new Date(),
    });

    await service.softDelete('f5', 'owner_1');

    expect(prismaMock.file.update).toHaveBeenCalledWith({
      where: { id: 'f5' },
      data: { deletedAt: expect.any(Date) },
    });
  });
});
