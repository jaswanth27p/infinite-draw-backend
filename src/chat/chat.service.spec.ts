import { BadRequestException } from '@nestjs/common';
import { ChatService } from './chat.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ChatService', () => {
  const prismaMock = {
    message: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };

  function buildService() {
    return new ChatService(prismaMock as unknown as PrismaService);
  }

  beforeEach(() => jest.clearAllMocks());

  describe('create', () => {
    const row = {
      id: 'm1',
      fileId: 'f1',
      authorId: 'user_1',
      body: 'hello',
      createdAt: new Date('2026-08-18T00:00:00Z'),
      author: { name: 'Alice', email: 'alice@x.com' },
    };

    it('trims the body, inserts a Message row, and resolves authorName', async () => {
      prismaMock.message.create.mockResolvedValue(row);
      const service = buildService();

      const result = await service.create('f1', 'user_1', '  hello  ');

      expect(prismaMock.message.create).toHaveBeenCalledWith({
        data: { fileId: 'f1', authorId: 'user_1', body: 'hello' },
        include: { author: { select: { name: true, email: true } } },
      });
      expect(result).toEqual({
        id: 'm1',
        fileId: 'f1',
        authorId: 'user_1',
        authorName: 'Alice',
        body: 'hello',
        createdAt: row.createdAt,
      });
    });

    it("falls back to the author's email when they have no name set", async () => {
      prismaMock.message.create.mockResolvedValue({
        ...row,
        author: { name: null, email: 'bob@x.com' },
      });
      const service = buildService();

      const result = await service.create('f1', 'user_1', 'hi');

      expect(result.authorName).toBe('bob@x.com');
    });

    it('rejects an empty (or whitespace-only) body without touching the database', async () => {
      const service = buildService();

      await expect(service.create('f1', 'user_1', '   ')).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.message.create).not.toHaveBeenCalled();
    });

    it('rejects a body over 4000 characters without touching the database', async () => {
      const service = buildService();
      const tooLong = 'a'.repeat(4001);

      await expect(service.create('f1', 'user_1', tooLong)).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.message.create).not.toHaveBeenCalled();
    });

    it('accepts a body at exactly the 4000-character cap', async () => {
      prismaMock.message.create.mockResolvedValue(row);
      const service = buildService();
      const maxLength = 'a'.repeat(4000);

      await expect(service.create('f1', 'user_1', maxLength)).resolves.toBeDefined();
    });
  });

  describe('list', () => {
    it('returns the newest-first payload shape, scoped to fileId', async () => {
      prismaMock.message.findMany.mockResolvedValue([
        {
          id: 'm1',
          fileId: 'f1',
          authorId: 'user_1',
          body: 'hello',
          createdAt: new Date('2026-08-18T00:00:00Z'),
          author: { name: 'Alice', email: 'alice@x.com' },
        },
      ]);
      const service = buildService();

      const result = await service.list('f1', undefined, 30);

      expect(prismaMock.message.findMany).toHaveBeenCalledWith({
        where: { fileId: 'f1' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 30,
        include: { author: { select: { name: true, email: true } } },
      });
      expect(result).toEqual([
        {
          id: 'm1',
          fileId: 'f1',
          authorId: 'user_1',
          authorName: 'Alice',
          body: 'hello',
          createdAt: new Date('2026-08-18T00:00:00Z'),
        },
      ]);
    });

    it('paginates via cursor when one is provided', async () => {
      prismaMock.message.findMany.mockResolvedValue([]);
      const service = buildService();

      await service.list('f1', 'm1', 30);

      expect(prismaMock.message.findMany).toHaveBeenCalledWith({
        where: { fileId: 'f1' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 30,
        cursor: { id: 'm1' },
        skip: 1,
        include: { author: { select: { name: true, email: true } } },
      });
    });

    it('defaults to a limit of 30 when none is provided', async () => {
      prismaMock.message.findMany.mockResolvedValue([]);
      const service = buildService();

      await service.list('f1');

      expect(prismaMock.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 30 }),
      );
    });
  });
});
