import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { File } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FilesService } from './files.service';

const AUTO_VERSION_CAP = 20;

@Injectable()
export class FileVersionsService {
  private readonly logger = new Logger(FileVersionsService.name);

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
        origin: 'MANUAL',
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
      select: { id: true, name: true, thumbnailUrl: true, origin: true, createdAt: true },
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

  async sweepIdleFiles(idleWindowMs: number): Promise<void> {
    const cutoff = new Date(Date.now() - idleWindowMs);
    // Correlated NOT EXISTS -- no Prisma findMany equivalent. Computes the
    // idle cutoff in JS (a plain Date parameter) rather than a
    // `now() - interval '5 minutes'` SQL literal, so the interval isn't
    // hardcoded into the query text and idleWindowMs stays a real runtime
    // parameter.
    const idleFiles = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT f.id FROM "File" f
      WHERE f."deletedAt" IS NULL
        AND f."updatedAt" <= ${cutoff}
        AND NOT EXISTS (
          SELECT 1 FROM "FileVersion" v
          WHERE v."fileId" = f.id AND v."createdAt" >= f."updatedAt"
        )
      ORDER BY f."updatedAt" ASC
      LIMIT 200;
    `;

    for (const { id } of idleFiles) {
      try {
        await this.createAutoVersion(id);
      } catch (err) {
        this.logger.warn(`Auto-version sweep failed for file ${id}: ${(err as Error).message}`);
      }
    }
  }

  private async createAutoVersion(fileId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const file = await tx.file.findUnique({ where: { id: fileId } });
      if (!file) return;

      const name = `Auto-saved — ${new Date().toLocaleString()}`;
      await tx.fileVersion.create({
        data: {
          fileId: file.id,
          name,
          data: file.currentData as object,
          thumbnailUrl: file.thumbnailUrl,
          origin: 'AUTO',
        },
      });

      const autoVersions = await tx.fileVersion.findMany({
        where: { fileId: file.id, origin: 'AUTO' },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      const toDelete = autoVersions.slice(AUTO_VERSION_CAP).map((v) => v.id);
      if (toDelete.length > 0) {
        await tx.fileVersion.deleteMany({ where: { id: { in: toDelete } } });
      }
    });
  }
}
