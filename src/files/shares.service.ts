import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateShareDto } from './dto/create-share.dto';
import { UpdateShareDto } from './dto/update-share.dto';

@Injectable()
export class SharesService {
  constructor(private readonly prisma: PrismaService) {}

  list(fileId: string) {
    return this.prisma.share.findMany({
      where: { fileId },
      select: { id: true, role: true, user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async invite(fileId: string, ownerId: string, dto: CreateShareDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      throw new NotFoundException('No account found for that email');
    }
    if (user.id === ownerId) {
      throw new BadRequestException("Can't share a file with its own owner");
    }
    return this.prisma.share.upsert({
      where: { fileId_userId: { fileId, userId: user.id } },
      create: { fileId, userId: user.id, role: dto.role },
      update: { role: dto.role },
    });
  }

  async updateRole(fileId: string, shareId: string, dto: UpdateShareDto) {
    await this.getOwnedShare(fileId, shareId);
    return this.prisma.share.update({ where: { id: shareId }, data: { role: dto.role } });
  }

  async remove(fileId: string, shareId: string) {
    await this.getOwnedShare(fileId, shareId);
    return this.prisma.share.delete({ where: { id: shareId } });
  }

  private async getOwnedShare(fileId: string, shareId: string) {
    const share = await this.prisma.share.findFirst({ where: { id: shareId, fileId } });
    if (!share) {
      throw new NotFoundException('Share not found');
    }
    return share;
  }
}
