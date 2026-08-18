import { Injectable, Logger } from '@nestjs/common';
import type { NotificationType, ShareRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway, notificationRoom } from './notifications.gateway';

export interface CreateNotificationInput {
  recipientId: string;
  actorId: string | null;
  type: NotificationType;
  file: { id: string; name: string };
  role?: ShareRole;
}

export interface NotificationPayload {
  id: string;
  type: NotificationType;
  actorName: string | null;
  fileId: string | null;
  fileName: string;
  role: ShareRole | null;
  read: boolean;
  createdAt: Date;
}

interface NotificationRow {
  id: string;
  type: NotificationType;
  fileId: string | null;
  fileName: string;
  role: ShareRole | null;
  read: boolean;
  createdAt: Date;
  actor: { name: string | null; email: string } | null;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
  ) {}

  async create(input: CreateNotificationInput): Promise<void> {
    const row = (await this.prisma.notification.create({
      data: {
        userId: input.recipientId,
        actorId: input.actorId,
        type: input.type,
        fileId: input.file.id,
        fileName: input.file.name,
        role: input.role ?? null,
      },
      include: { actor: { select: { name: true, email: true } } },
    })) as unknown as NotificationRow;

    const payload = this.toPayload(row);

    try {
      this.gateway.server.to(notificationRoom(input.recipientId)).emit('notification', payload);
    } catch (err) {
      // Best-effort delivery: a WS emit failure must never fail the
      // sharing/role-change/removal/general-access request that triggered
      // this notification. The DB row (already written above) is the
      // source of truth — an offline recipient picks it up on their next
      // GET /notifications fetch.
      this.logger.warn(`Failed to emit live notification: ${(err as Error).message}`);
    }
  }

  async list(userId: string, cursor?: string, limit = 20): Promise<NotificationPayload[]> {
    const rows = (await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { actor: { select: { name: true, email: true } } },
    })) as unknown as NotificationRow[];

    return rows.map((row) => this.toPayload(row));
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, read: false } });
  }

  async markRead(userId: string, id: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { read: true },
    });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }

  private toPayload(row: NotificationRow): NotificationPayload {
    return {
      id: row.id,
      type: row.type,
      actorName: row.actor?.name ?? row.actor?.email ?? null,
      fileId: row.fileId,
      fileName: row.fileName,
      role: row.role,
      read: row.read,
      createdAt: row.createdAt,
    };
  }
}
