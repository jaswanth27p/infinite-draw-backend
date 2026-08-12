import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FilesService } from './files.service';

@Injectable()
export class FileVersionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly filesService: FilesService,
  ) {}

  async save(fileId: string, ownerId: string, name: string, thumbnailUrl?: string) {
    const file = await this.filesService.getOwned(fileId, ownerId);
    return this.prisma.fileVersion.create({
      data: {
        fileId: file.id,
        name,
        data: file.currentData as object,
        thumbnailUrl: thumbnailUrl ?? file.thumbnailUrl,
      },
    });
  }

  async list(fileId: string, ownerId: string) {
    await this.filesService.getOwned(fileId, ownerId);
    return this.prisma.fileVersion.findMany({
      where: { fileId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async restore(fileId: string, versionId: string, ownerId: string) {
    const file = await this.filesService.getOwned(fileId, ownerId);
    const version = await this.prisma.fileVersion.findFirst({
      where: { id: versionId, fileId: file.id },
    });
    if (!version) {
      throw new NotFoundException('Version not found');
    }
    return this.prisma.file.update({
      where: { id: file.id },
      data: { currentData: version.data as object, thumbnailUrl: version.thumbnailUrl },
    });
  }
}
