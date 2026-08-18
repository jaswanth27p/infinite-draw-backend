import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateShareDto } from './dto/create-share.dto';
import { UpdateShareDto } from './dto/update-share.dto';

@Injectable()
export class SharesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  list(fileId: string) {
    return this.prisma.share.findMany({
      where: { fileId },
      select: { id: true, role: true, user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async invite(fileId: string, ownerId: string, fileName: string, dto: CreateShareDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      throw new NotFoundException('No account found for that email');
    }
    if (user.id === ownerId) {
      throw new BadRequestException("Can't share a file with its own owner");
    }
    const share = await this.prisma.share.upsert({
      where: { fileId_userId: { fileId, userId: user.id } },
      create: { fileId, userId: user.id, role: dto.role },
      update: { role: dto.role },
    });
    await this.notificationsService.create({
      recipientId: user.id,
      actorId: ownerId,
      type: 'FILE_SHARED',
      file: { id: fileId, name: fileName },
      role: dto.role,
    });
    return share;
  }

  async updateRole(fileId: string, shareId: string, ownerId: string, fileName: string, dto: UpdateShareDto) {
    const share = await this.getOwnedShare(fileId, shareId);
    const updated = await this.prisma.share.update({ where: { id: shareId }, data: { role: dto.role } });
    await this.notificationsService.create({
      recipientId: share.userId,
      actorId: ownerId,
      type: 'ROLE_CHANGED',
      file: { id: fileId, name: fileName },
      role: dto.role,
    });
    return updated;
  }

  async remove(fileId: string, shareId: string, ownerId: string, fileName: string) {
    const share = await this.getOwnedShare(fileId, shareId);
    const removed = await this.prisma.share.delete({ where: { id: shareId } });
    await this.notificationsService.create({
      recipientId: share.userId,
      actorId: ownerId,
      type: 'ACCESS_REMOVED',
      file: { id: fileId, name: fileName },
    });
    return removed;
  }

  private async getOwnedShare(fileId: string, shareId: string) {
    const share = await this.prisma.share.findFirst({ where: { id: shareId, fileId } });
    if (!share) {
      throw new NotFoundException('Share not found');
    }
    return share;
  }
}
