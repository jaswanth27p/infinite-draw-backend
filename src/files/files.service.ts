import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GeneralAccess, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UpdateFileDto } from './dto/update-file.dto';
import { UpdateGeneralAccessDto } from './dto/update-general-access.dto';
import { Role } from './role';

const FILE_LIST_SELECT = {
  id: true,
  name: true,
  thumbnailUrl: true,
  thumbnailUrlDark: true,
  updatedAt: true,
} as const;

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private async withStarred<T extends { id: string }>(
    userId: string,
    files: T[],
  ): Promise<(T & { starred: boolean })[]> {
    if (files.length === 0) {
      return [];
    }
    const stars = await this.prisma.star.findMany({
      where: { userId, fileId: { in: files.map((f) => f.id) } },
      select: { fileId: true },
    });
    const starredIds = new Set(stars.map((s) => s.fileId));
    return files.map((f) => ({ ...f, starred: starredIds.has(f.id) }));
  }

  async list(ownerId: string, cursor?: string, take = 30, q?: string) {
    const rows = await this.prisma.file.findMany({
      where: { ownerId, deletedAt: null, ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}) },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: FILE_LIST_SELECT,
    });
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    const items = await this.withStarred(ownerId, page);
    return { items, nextCursor: hasMore ? page[page.length - 1].id : null };
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

  async update(id: string, dto: UpdateFileDto) {
    // Defensive on its own terms: explicitly destructure only the fields
    // UpdateFileDto declares instead of casting the whole dto to
    // Prisma.FileUpdateInput. This route sits behind an EDITOR floor, and a
    // blanket cast would forward *any* key the caller sends straight to
    // Prisma, relying solely on the global ValidationPipe({ whitelist:
    // true }) in main.ts (a setting that lives in a different file) to keep
    // e.g. generalAccess/ownerId from being smuggled through.
    const { name, currentData, thumbnailUrl, thumbnailUrlDark } = dto;
    const data: Prisma.FileUpdateInput = {};
    if (name !== undefined) {
      data.name = name;
    }
    if (currentData !== undefined) {
      data.currentData = currentData as Prisma.InputJsonValue;
    }
    if (thumbnailUrl !== undefined) {
      data.thumbnailUrl = thumbnailUrl;
    }
    if (thumbnailUrlDark !== undefined) {
      data.thumbnailUrlDark = thumbnailUrlDark;
    }
    const file = await this.prisma.file.update({
      where: { id },
      data,
    });
    if (thumbnailUrl !== undefined) {
      await this.notifyThumbnailUpdated(id, thumbnailUrl, thumbnailUrlDark);
    }
    return file;
  }

  async notifyThumbnailUpdated(fileId: string, thumbnailUrl: string, thumbnailUrlDark?: string): Promise<void> {
    try {
      const file = await this.prisma.file.findUnique({ where: { id: fileId }, select: { ownerId: true } });
      if (!file) return;
      const shares = await this.prisma.share.findMany({ where: { fileId }, select: { userId: true } });
      const userIds = [file.ownerId, ...shares.map((s) => s.userId)];
      this.notificationsService.notifyThumbnailUpdated(userIds, fileId, thumbnailUrl, thumbnailUrlDark);
    } catch (err) {
      this.logger.warn(`Failed to broadcast thumbnail update for ${fileId}: ${(err as Error).message}`);
    }
  }

  // Ownership is enforced by FileAccessGuard + @RequireRole('OWNER') at the
  // controller (mirroring update()/updateGeneralAccess()) — the caller is
  // guaranteed to already hold OWNER access before either method runs.
  softDelete(id: string) {
    return this.prisma.file.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  restore(id: string) {
    return this.prisma.file.update({
      where: { id },
      data: { deletedAt: null },
    });
  }

  async getAccess(
    fileId: string,
    userId: string | undefined,
    options?: { includeDeleted?: boolean },
  ): Promise<{ file: Awaited<ReturnType<typeof this.prisma.file.findFirst>> & object; role: Role } | null> {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, ...(options?.includeDeleted ? {} : { deletedAt: null }) },
    });
    if (!file) {
      return null;
    }
    if (userId === undefined) {
      if (file.generalAccess === 'ANYONE') {
        return { file, role: 'VIEWER' };
      }
      return null;
    }
    if (file.ownerId === userId) {
      return { file, role: 'OWNER' };
    }
    const share = await this.prisma.share.findUnique({
      where: { fileId_userId: { fileId, userId } },
    });
    if (share) {
      return { file, role: share.role };
    }
    if (file.generalAccess === 'ANYONE' && file.generalAccessRole) {
      return { file, role: file.generalAccessRole };
    }
    return null;
  }

  listShared(userId: string, cursor?: string, take = 30) {
    return this.prisma.share
      .findMany({
        where: { userId, file: { deletedAt: null } },
        select: {
          id: true,
          role: true,
          file: {
            select: {
              id: true,
              name: true,
              thumbnailUrl: true,
              thumbnailUrlDark: true,
              updatedAt: true,
              owner: { select: { name: true, email: true } },
            },
          },
        },
        orderBy: [{ file: { updatedAt: 'desc' } }, { id: 'desc' }],
        take: take + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      })
      .then(async (rows) => {
        const hasMore = rows.length > take;
        const page = hasMore ? rows.slice(0, take) : rows;
        const mapped = page.map((s) => ({
          id: s.file.id,
          name: s.file.name,
          thumbnailUrl: s.file.thumbnailUrl,
          thumbnailUrlDark: s.file.thumbnailUrlDark,
          updatedAt: s.file.updatedAt,
          role: s.role,
          owner: s.file.owner,
        }));
        const items = await this.withStarred(userId, mapped);
        return { items, nextCursor: hasMore ? page[page.length - 1].id : null };
      });
  }

  async updateGeneralAccess(id: string, dto: UpdateGeneralAccessDto) {
    if (dto.generalAccess === GeneralAccess.ANYONE && !dto.generalAccessRole) {
      throw new BadRequestException('generalAccessRole is required when generalAccess is ANYONE');
    }
    const file = await this.prisma.file.update({
      where: { id },
      data: {
        generalAccess: dto.generalAccess,
        generalAccessRole: dto.generalAccess === GeneralAccess.ANYONE ? dto.generalAccessRole! : null,
      },
    });
    await this.notificationsService.create({
      recipientId: file.ownerId,
      actorId: file.ownerId,
      type: 'GENERAL_ACCESS_CHANGED',
      file: { id: file.id, name: file.name },
    });
    return file;
  }

  star(userId: string, fileId: string) {
    return this.prisma.star.upsert({
      where: { userId_fileId: { userId, fileId } },
      create: { userId, fileId },
      update: {},
    });
  }

  unstar(userId: string, fileId: string) {
    return this.prisma.star.deleteMany({ where: { userId, fileId } });
  }

  // Filters on the caller's current access, not just their own past act of
  // starring — without this, a Star row outlives the Share/general-access
  // grant that justified it (e.g. after SharesService#remove, or after an
  // owner flips generalAccess back to RESTRICTED), and the ex-collaborator
  // keeps seeing the file's name/thumbnail on this list indefinitely.
  async listStarred(userId: string, cursor?: string, take = 30, q?: string) {
    const rows = await this.prisma.star.findMany({
      where: {
        userId,
        file: {
          deletedAt: null,
          OR: [
            { ownerId: userId },
            { shares: { some: { userId } } },
            { generalAccess: GeneralAccess.ANYONE, generalAccessRole: { not: null } },
          ],
          ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
        },
      },
      select: { id: true, file: { select: FILE_LIST_SELECT } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    const items = page.map((s) => ({ ...s.file, starred: true }));
    return { items, nextCursor: hasMore ? page[page.length - 1].id : null };
  }

  async listTrash(ownerId: string, cursor?: string, take = 30, q?: string) {
    const rows = await this.prisma.file.findMany({
      where: { ownerId, deletedAt: { not: null }, ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}) },
      orderBy: [{ deletedAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { ...FILE_LIST_SELECT, deletedAt: true },
    });
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    return { items: page, nextCursor: hasMore ? page[page.length - 1].id : null };
  }

  // @AllowDeleted() on the controller route means getAccess() resolves this
  // id whether or not the file is actually soft-deleted — deleteMany's own
  // deletedAt: { not: null } filter is what actually enforces "only a
  // trashed file can be destroyed forever," not the guard chain. Without
  // this, DELETE /files/:id/permanent would hard-delete a live file the
  // owner never trashed, bypassing Trash's entire safety net.
  async permanentDelete(id: string) {
    const { count } = await this.prisma.file.deleteMany({
      where: { id, deletedAt: { not: null } },
    });
    if (count === 0) {
      throw new NotFoundException('File not found in trash');
    }
  }
}
