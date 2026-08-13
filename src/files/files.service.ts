import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { GeneralAccess, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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

  update(id: string, dto: UpdateFileDto) {
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

  async getAccess(fileId: string, userId: string): Promise<{ file: Awaited<ReturnType<typeof this.prisma.file.findFirst>> & object; role: Role } | null> {
    const file = await this.prisma.file.findFirst({ where: { id: fileId, deletedAt: null } });
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
    return this.prisma.file.update({
      where: { id },
      data: {
        generalAccess: dto.generalAccess,
        generalAccessRole: dto.generalAccess === GeneralAccess.ANYONE ? dto.generalAccessRole! : null,
      },
    });
  }
}
