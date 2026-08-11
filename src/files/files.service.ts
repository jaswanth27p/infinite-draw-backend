import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateFileDto } from './dto/update-file.dto';

const FILE_LIST_SELECT = {
  id: true,
  name: true,
  thumbnailUrl: true,
  updatedAt: true,
} as const;

@Injectable()
export class FilesService {
  constructor(private readonly prisma: PrismaService) {}

  list(ownerId: string) {
    return this.prisma.file.findMany({
      where: { ownerId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      select: FILE_LIST_SELECT,
    });
  }

  create(ownerId: string) {
    return this.prisma.file.create({
      data: {
        ownerId,
        name: 'Untitled',
        currentData: { elements: [], appState: {} },
      },
    });
  }

  async getOwned(id: string, ownerId: string) {
    const file = await this.prisma.file.findFirst({
      where: { id, ownerId, deletedAt: null },
    });
    if (!file) {
      throw new NotFoundException('File not found');
    }
    return file;
  }

  async update(id: string, ownerId: string, dto: UpdateFileDto) {
    await this.getOwned(id, ownerId);
    return this.prisma.file.update({
      where: { id },
      data: dto as Prisma.FileUpdateInput,
    });
  }

  async softDelete(id: string, ownerId: string) {
    await this.getOwned(id, ownerId);
    return this.prisma.file.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async restore(id: string, ownerId: string) {
    const file = await this.prisma.file.findFirst({ where: { id, ownerId } });
    if (!file) {
      throw new NotFoundException('File not found');
    }
    return this.prisma.file.update({
      where: { id },
      data: { deletedAt: null },
    });
  }
}
