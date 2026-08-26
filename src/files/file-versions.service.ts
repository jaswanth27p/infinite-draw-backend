import { Injectable, NotFoundException } from '@nestjs/common';
import type { File } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FilesService } from './files.service';

@Injectable()
export class FileVersionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly filesService: FilesService,
  ) {}

  async save(file: File, name: string, thumbnailUrl?: string) {
    const version = await this.prisma.fileVersion.create({
      data: {
        fileId: file.id,
        name,
        data: file.currentData as object,
        thumbnailUrl: thumbnailUrl ?? file.thumbnailUrl,
      },
    });

    if (thumbnailUrl) {
      await this.prisma.file.update({
        where: { id: file.id },
        data: { thumbnailUrl },
      });
      await this.filesService.notifyThumbnailUpdated(file.id, thumbnailUrl);
    }

    return version;
  }

  list(fileId: string) {
    return this.prisma.fileVersion.findMany({
      where: { fileId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, thumbnailUrl: true, createdAt: true },
    });
  }

  async restore(file: File, versionId: string) {
    const version = await this.prisma.fileVersion.findFirst({
      where: { id: versionId, fileId: file.id },
    });
    if (!version) {
      throw new NotFoundException('Version not found');
    }
    const updated = await this.prisma.file.update({
      where: { id: file.id },
      data: { currentData: version.data as object, thumbnailUrl: version.thumbnailUrl },
    });
    if (updated.thumbnailUrl) {
      await this.filesService.notifyThumbnailUpdated(file.id, updated.thumbnailUrl);
    }
    return updated;
  }
}
