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
    const version = await this.prisma.fileVersion.create({
      data: {
        fileId: file.id,
        name,
        data: file.currentData as object,
        thumbnailUrl: thumbnailUrl ?? file.thumbnailUrl,
      },
    });

    // Write the caller-supplied thumbnail through to the File row so the
    // /files list (FileCard) has something to render — this is the only
    // path that ever sets File.thumbnailUrl on save. It deliberately never
    // touches currentData: autosave remains the sole writer of that field.
    if (thumbnailUrl) {
      await this.prisma.file.update({
        where: { id: file.id },
        data: { thumbnailUrl },
      });
    }

    return version;
  }

  async list(fileId: string, ownerId: string) {
    await this.filesService.getOwned(fileId, ownerId);
    return this.prisma.fileVersion.findMany({
      where: { fileId },
      orderBy: { createdAt: 'desc' },
      // The version-history panel only ever renders these fields — the
      // full scene JSON (`data`) is large and only needed on restore, so
      // don't ship it on every list call (which autosave was also
      // triggering via query-key prefix invalidation before that was
      // fixed on the frontend).
      select: { id: true, name: true, thumbnailUrl: true, createdAt: true },
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
