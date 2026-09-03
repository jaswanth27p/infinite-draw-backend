import { BadRequestException } from '@nestjs/common';
import { ChatService } from './chat.service';
import { PrismaService } from '../prisma/prisma.service';
import { FilesService } from '../files/files.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('ChatService', () => {
  const prismaMock = {
    message: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    file: {
      findUnique: jest.fn(),
    },
  };
  const filesServiceMock = { getAccess: jest.fn() };
  const notificationsServiceMock = { create: jest.fn() };

  function buildService() {
    return new ChatService(
      prismaMock as unknown as PrismaService,
      filesServiceMock as unknown as FilesService,
      notificationsServiceMock as unknown as NotificationsService,
    );
  }

  beforeEach(() => jest.clearAllMocks());

  describe('create', () => {
    const row = {
      id: 'm1',
      fileId: 'f1',
      authorId: 'user_1',
      body: 'hello',
      mentionedUserIds: [],
      createdAt: new Date('2026-08-18T00:00:00Z'),
      author: { name: 'Alice', email: 'alice@x.com' },
    };

    it('trims the body, inserts a Message row, and resolves authorName', async () => {
      prismaMock.message.create.mockResolvedValue(row);
      const service = buildService();

      const result = await service.create('f1', 'user_1', '  hello  ');

      expect(prismaMock.message.create).toHaveBeenCalledWith({
        data: { fileId: 'f1', authorId: 'user_1', body: 'hello', mentionedUserIds: [] },
        include: { author: { select: { name: true, email: true } } },
      });
      expect(result).toEqual({
        id: 'm1',
        fileId: 'f1',
        authorId: 'user_1',
        authorName: 'Alice',
        body: 'hello',
        mentionedUserIds: [],
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

  describe('create with mentions', () => {
    const rowWithMention = {
      id: 'm1',
      fileId: 'f1',
      authorId: 'user_1',
      body: 'hi @Bob @Ghost',
      mentionedUserIds: ['user_2'],
      createdAt: new Date('2026-09-03T00:00:00Z'),
      author: { name: 'Alice', email: 'alice@x.com' },
    };

    it('filters mentionedUserIds down to candidates FilesService.getAccess currently grants access to', async () => {
      filesServiceMock.getAccess.mockImplementation((_fileId: string, userId: string) =>
        userId === 'user_2' ? Promise.resolve({ file: {}, role: 'VIEWER' }) : Promise.resolve(null),
      );
      prismaMock.message.create.mockResolvedValue(rowWithMention);
      prismaMock.file.findUnique.mockResolvedValue({ id: 'f1', name: 'Doc' });
      const service = buildService();

      const result = await service.create('f1', 'user_1', 'hi @Bob @Ghost', ['user_2', 'user_ghost']);

      expect(filesServiceMock.getAccess).toHaveBeenCalledWith('f1', 'user_2');
      expect(filesServiceMock.getAccess).toHaveBeenCalledWith('f1', 'user_ghost');
      expect(prismaMock.message.create).toHaveBeenCalledWith({
        data: { fileId: 'f1', authorId: 'user_1', body: 'hi @Bob @Ghost', mentionedUserIds: ['user_2'] },
        include: { author: { select: { name: true, email: true } } },
      });
      expect(result.mentionedUserIds).toEqual(['user_2']);
    });

    it('creates a MENTIONED notification for each valid mention, not for invalid ones', async () => {
      filesServiceMock.getAccess.mockImplementation((_fileId: string, userId: string) =>
        userId === 'user_2' ? Promise.resolve({ file: {}, role: 'VIEWER' }) : Promise.resolve(null),
      );
      prismaMock.message.create.mockResolvedValue(rowWithMention);
      prismaMock.file.findUnique.mockResolvedValue({ id: 'f1', name: 'Doc' });
      const service = buildService();

      await service.create('f1', 'user_1', 'hi @Bob @Ghost', ['user_2', 'user_ghost']);

      expect(notificationsServiceMock.create).toHaveBeenCalledTimes(1);
      expect(notificationsServiceMock.create).toHaveBeenCalledWith({
        recipientId: 'user_2',
        actorId: 'user_1',
        type: 'MENTIONED',
        file: { id: 'f1', name: 'Doc' },
      });
    });

    it('creates no notification when there are no valid mentions', async () => {
      filesServiceMock.getAccess.mockResolvedValue(null);
      prismaMock.message.create.mockResolvedValue({ ...rowWithMention, mentionedUserIds: [] });
      const service = buildService();

      await service.create('f1', 'user_1', 'hi @Ghost', ['user_ghost']);

      expect(notificationsServiceMock.create).not.toHaveBeenCalled();
      expect(prismaMock.file.findUnique).not.toHaveBeenCalled();
    });

    it('deduplicates repeated candidate ids before checking access', async () => {
      filesServiceMock.getAccess.mockResolvedValue({ file: {}, role: 'VIEWER' });
      prismaMock.message.create.mockResolvedValue(rowWithMention);
      prismaMock.file.findUnique.mockResolvedValue({ id: 'f1', name: 'Doc' });
      const service = buildService();

      await service.create('f1', 'user_1', 'hi @Bob @Bob', ['user_2', 'user_2']);

      expect(filesServiceMock.getAccess).toHaveBeenCalledTimes(1);
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
          mentionedUserIds: [],
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
          mentionedUserIds: [],
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
