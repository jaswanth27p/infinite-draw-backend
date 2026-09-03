import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';

const NOTIFICATION_PREFERENCE_SELECT = {
  notifyFileShared: true,
  notifyRoleChanged: true,
  notifyAccessRemoved: true,
  notifyMentioned: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  getNotificationPreferences(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: NOTIFICATION_PREFERENCE_SELECT,
    });
  }

  // Explicitly destructures only the dto's own fields rather than passing
  // it straight through, matching FilesService#update's defensive
  // convention — defense in depth even with the global whitelisting
  // ValidationPipe already stripping unknown keys.
  updateNotificationPreferences(userId: string, dto: UpdateNotificationPreferencesDto) {
    const { notifyFileShared, notifyRoleChanged, notifyAccessRemoved, notifyMentioned } = dto;
    const data: Prisma.UserUpdateInput = {};
    if (notifyFileShared !== undefined) data.notifyFileShared = notifyFileShared;
    if (notifyRoleChanged !== undefined) data.notifyRoleChanged = notifyRoleChanged;
    if (notifyAccessRemoved !== undefined) data.notifyAccessRemoved = notifyAccessRemoved;
    if (notifyMentioned !== undefined) data.notifyMentioned = notifyMentioned;
    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: NOTIFICATION_PREFERENCE_SELECT,
    });
  }
}
