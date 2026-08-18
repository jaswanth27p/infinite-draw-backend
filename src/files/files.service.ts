import { BadRequestException, Injectable } from '@nestjs/common';
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
  updatedAt: true,
} as const;

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

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

  update(id: string, dto: UpdateFileDto) {
    // Defensive on its own terms: explicitly destructure only the fields
    // UpdateFileDto declares instead of casting the whole dto to
    // Prisma.FileUpdateInput. This route sits behind an EDITOR floor, and a
    // blanket cast would forward *any* key the caller sends straight to
    // Prisma, relying solely on the global ValidationPipe({ whitelist:
    // true }) in main.ts (a setting that lives in a different file) to keep
    // e.g. generalAccess/ownerId from being smuggled through.
    const { name, currentData, thumbnailUrl } = dto;
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
    return this.prisma.file.update({
      where: { id },
      data,
    });
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
    userId: string,
    options?: { includeDeleted?: boolean },
  ): Promise<{ file: Awaited<ReturnType<typeof this.prisma.file.findFirst>> & object; role: Role } | null> {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, ...(options?.includeDeleted ? {} : { deletedAt: null }) },
    });
    if (!file) {
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

  listShared(userId: string) {
    return this.prisma.share
      .findMany({
        where: { userId, file: { deletedAt: null } },
        select: {
          role: true,
          file: {
            select: {
              id: true,
              name: true,
              thumbnailUrl: true,
              updatedAt: true,
              owner: { select: { name: true, email: true } },
            },
          },
        },
        orderBy: { file: { updatedAt: 'desc' } },
      })
      .then((shares) =>
        shares.map((s) => ({
          id: s.file.id,
          name: s.file.name,
          thumbnailUrl: s.file.thumbnailUrl,
          updatedAt: s.file.updatedAt,
          role: s.role,
          owner: s.file.owner,
        })),
      );
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
}
