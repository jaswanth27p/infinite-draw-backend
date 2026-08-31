import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';

@Injectable()
export class ThumbnailSweepService {
  private readonly logger = new Logger(ThumbnailSweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Auto-thumbnail regen mints a brand-new S3 key on every write and never
   * deletes the one it replaced, so both live-editing overwrites and hard
   * file deletes leave orphaned objects behind. Rather than track deletions
   * at every write site (risking a key still held by a saved FileVersion),
   * this reconciles storage against the DB directly: anything under
   * thumbnails/ that no File or FileVersion row currently points to, and
   * that's older than the grace period, is safe to delete.
   */
  async sweep(graceMs: number): Promise<number> {
    const [objects, referenced] = await Promise.all([
      this.storage.listThumbnailKeys(),
      this.referencedKeys(),
    ]);

    const cutoff = Date.now() - graceMs;
    const orphaned = objects.filter(
      (obj) => obj.lastModified.getTime() < cutoff && !referenced.has(obj.key),
    );

    for (const obj of orphaned) {
      await this.storage.deleteObject(obj.key);
    }
    if (orphaned.length > 0) {
      this.logger.log(`Swept ${orphaned.length} orphaned thumbnail object(s)`);
    }
    return orphaned.length;
  }

  private async referencedKeys(): Promise<Set<string>> {
    const [files, versions] = await Promise.all([
      this.prisma.file.findMany({
        where: { thumbnailUrl: { not: null } },
        select: { thumbnailUrl: true },
      }),
      this.prisma.fileVersion.findMany({
        where: { thumbnailUrl: { not: null } },
        select: { thumbnailUrl: true },
      }),
    ]);

    const keys = new Set<string>();
    for (const url of [...files, ...versions].map((row) => row.thumbnailUrl)) {
      const key = url ? this.storage.keyFromPublicUrl(url) : null;
      if (key) keys.add(key);
    }
    return keys;
  }
}
