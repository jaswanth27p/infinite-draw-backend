import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const MAX_BODY_LENGTH = 4000;

export interface MessagePayload {
  id: string;
  fileId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: Date;
}

interface MessageRow {
  id: string;
  fileId: string;
  authorId: string;
  body: string;
  createdAt: Date;
  author: { name: string | null; email: string };
}

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async create(fileId: string, authorId: string, body: string): Promise<MessagePayload> {
    const trimmed = body.trim();
    if (trimmed.length === 0) {
      throw new BadRequestException('Message body must not be empty');
    }
    if (trimmed.length > MAX_BODY_LENGTH) {
      throw new BadRequestException(`Message body must be ${MAX_BODY_LENGTH} characters or fewer`);
    }

    const row = (await this.prisma.message.create({
      data: { fileId, authorId, body: trimmed },
      include: { author: { select: { name: true, email: true } } },
    })) as unknown as MessageRow;

    return this.toPayload(row);
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
      createdAt: row.createdAt,
    };
  }
}
