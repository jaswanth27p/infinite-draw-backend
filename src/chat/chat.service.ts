import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FilesService } from '../files/files.service';
import { NotificationsService } from '../notifications/notifications.service';

const MAX_BODY_LENGTH = 4000;

export interface MessagePayload {
  id: string;
  fileId: string;
  authorId: string;
  authorName: string;
  body: string;
  mentionedUserIds: string[];
  createdAt: Date;
}

interface MessageRow {
  id: string;
  fileId: string;
  authorId: string;
  body: string;
  mentionedUserIds: string[];
  createdAt: Date;
  author: { name: string | null; email: string };
}

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly filesService: FilesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(
    fileId: string,
    authorId: string,
    body: string,
    mentionedUserIds: string[] = [],
  ): Promise<MessagePayload> {
    const trimmed = body.trim();
    if (trimmed.length === 0) {
      throw new BadRequestException('Message body must not be empty');
    }
    if (trimmed.length > MAX_BODY_LENGTH) {
      throw new BadRequestException(`Message body must be ${MAX_BODY_LENGTH} characters or fewer`);
    }

    // Never trust the client's mention list: a stale autocomplete (built
    // from a shares list fetched before someone's access was revoked)
    // could otherwise let a message "mention" -- and notify -- a user who
    // no longer has access, leaking that the file exists/was shared with
    // them to a former collaborator. Re-check each candidate against the
    // same access resolution every other guard in this app uses.
    const uniqueCandidates = Array.from(new Set(mentionedUserIds));
    const accessResults = await Promise.all(
      uniqueCandidates.map((id) => this.filesService.getAccess(fileId, id)),
    );
    const validMentionedUserIds = uniqueCandidates.filter((_, i) => accessResults[i] !== null);

    const row = (await this.prisma.message.create({
      data: { fileId, authorId, body: trimmed, mentionedUserIds: validMentionedUserIds },
      include: { author: { select: { name: true, email: true } } },
    })) as unknown as MessageRow;

    const payload = this.toPayload(row);

    if (validMentionedUserIds.length > 0) {
      const file = await this.prisma.file.findUnique({
        where: { id: fileId },
        select: { id: true, name: true },
      });
      if (file) {
        // NotificationsService.create already no-ops when recipientId ===
        // actorId, so a self-mention needs no extra handling here.
        await Promise.all(
          validMentionedUserIds.map((recipientId) =>
            this.notificationsService.create({
              recipientId,
              actorId: authorId,
              type: 'MENTIONED',
              file,
            }),
          ),
        );
      }
    }

    return payload;
  }

  async list(fileId: string, cursor?: string, limit = 30): Promise<MessagePayload[]> {
    const rows = (await this.prisma.message.findMany({
      where: { fileId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { author: { select: { name: true, email: true } } },
    })) as unknown as MessageRow[];

    return rows.map((row) => this.toPayload(row));
  }

  private toPayload(row: MessageRow): MessagePayload {
    return {
      id: row.id,
      fileId: row.fileId,
      authorId: row.authorId,
      authorName: row.author.name ?? row.author.email,
      body: row.body,
      mentionedUserIds: row.mentionedUserIds,
      createdAt: row.createdAt,
    };
  }
}
