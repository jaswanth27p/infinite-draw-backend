import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SharesService } from './shares.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('SharesService', () => {
  const prismaMock = {
    user: { findUnique: jest.fn() },
    share: { findMany: jest.fn(), upsert: jest.fn(), findFirst: jest.fn(), update: jest.fn(), delete: jest.fn() },
  };
  const notificationsServiceMock = { create: jest.fn() };

  async function buildService() {
    const module = await Test.createTestingModule({
      providers: [
        SharesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NotificationsService, useValue: notificationsServiceMock },
      ],
    }).compile();
    return module.get(SharesService);
  }

  beforeEach(() => jest.clearAllMocks());

  it('list returns shares with the invited user\'s name/email', async () => {
    const service = await buildService();
    prismaMock.share.findMany.mockResolvedValue([{ id: 's1', role: 'VIEWER', user: { name: 'A', email: 'a@x.com' } }]);

    const result = await service.list('f1');

    expect(result).toEqual([{ id: 's1', role: 'VIEWER', user: { name: 'A', email: 'a@x.com' } }]);
    expect(prismaMock.share.findMany).toHaveBeenCalledWith({
      where: { fileId: 'f1' },
      select: { id: true, role: true, user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('invite upserts a Share for an existing user by email', async () => {
    const service = await buildService();
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user_2', email: 'b@x.com' });
    prismaMock.share.upsert.mockResolvedValue({ id: 's1', role: 'EDITOR' });

    const result = await service.invite('f1', 'owner_1', 'Q3 Roadmap', { email: 'b@x.com', role: 'EDITOR' as never });

    expect(result).toEqual({ id: 's1', role: 'EDITOR' });
    expect(prismaMock.share.upsert).toHaveBeenCalledWith({
      where: { fileId_userId: { fileId: 'f1', userId: 'user_2' } },
      create: { fileId: 'f1', userId: 'user_2', role: 'EDITOR' },
      update: { role: 'EDITOR' },
    });
  });

  it('invite creates a FILE_SHARED notification for the invited user', async () => {
    const service = await buildService();
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user_2', email: 'b@x.com' });
    prismaMock.share.upsert.mockResolvedValue({ id: 's1', role: 'EDITOR' });

    await service.invite('f1', 'owner_1', 'Q3 Roadmap', { email: 'b@x.com', role: 'EDITOR' as never });

    expect(notificationsServiceMock.create).toHaveBeenCalledWith({
      recipientId: 'user_2',
      actorId: 'owner_1',
      type: 'FILE_SHARED',
      file: { id: 'f1', name: 'Q3 Roadmap' },
      role: 'EDITOR',
    });
  });

  it('invite throws NotFoundException when the email has no account', async () => {
    const service = await buildService();
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(
      service.invite('f1', 'owner_1', 'Q3 Roadmap', { email: 'nobody@x.com', role: 'VIEWER' as never }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prismaMock.share.upsert).not.toHaveBeenCalled();
    expect(notificationsServiceMock.create).not.toHaveBeenCalled();
  });

  it('invite throws BadRequestException when inviting the file\'s own owner', async () => {
    const service = await buildService();
    prismaMock.user.findUnique.mockResolvedValue({ id: 'owner_1', email: 'owner@x.com' });

    await expect(
      service.invite('f1', 'owner_1', 'Q3 Roadmap', { email: 'owner@x.com', role: 'VIEWER' as never }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prismaMock.share.upsert).not.toHaveBeenCalled();
    expect(notificationsServiceMock.create).not.toHaveBeenCalled();
  });

  it('updateRole changes the role of a share belonging to the file', async () => {
    const service = await buildService();
    prismaMock.share.findFirst.mockResolvedValue({ id: 's1', fileId: 'f1', userId: 'user_2' });
    prismaMock.share.update.mockResolvedValue({ id: 's1', role: 'EDITOR' });

    await service.updateRole('f1', 's1', 'owner_1', 'Q3 Roadmap', { role: 'EDITOR' as never });

    expect(prismaMock.share.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { role: 'EDITOR' } });
  });

  it('updateRole creates a ROLE_CHANGED notification for the share\'s user', async () => {
    const service = await buildService();
    prismaMock.share.findFirst.mockResolvedValue({ id: 's1', fileId: 'f1', userId: 'user_2' });
    prismaMock.share.update.mockResolvedValue({ id: 's1', role: 'VIEWER' });

    await service.updateRole('f1', 's1', 'owner_1', 'Q3 Roadmap', { role: 'VIEWER' as never });

    expect(notificationsServiceMock.create).toHaveBeenCalledWith({
      recipientId: 'user_2',
      actorId: 'owner_1',
      type: 'ROLE_CHANGED',
      file: { id: 'f1', name: 'Q3 Roadmap' },
      role: 'VIEWER',
    });
  });

  it('updateRole throws NotFoundException when the share does not belong to the file', async () => {
    const service = await buildService();
    prismaMock.share.findFirst.mockResolvedValue(null);

    await expect(
      service.updateRole('f1', 'not-mine', 'owner_1', 'Q3 Roadmap', { role: 'EDITOR' as never }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(notificationsServiceMock.create).not.toHaveBeenCalled();
  });

  it('remove deletes a share belonging to the file', async () => {
    const service = await buildService();
    prismaMock.share.findFirst.mockResolvedValue({ id: 's1', fileId: 'f1', userId: 'user_2' });
    prismaMock.share.delete.mockResolvedValue({ id: 's1' });

    await service.remove('f1', 's1', 'owner_1', 'Q3 Roadmap');

    expect(prismaMock.share.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
  });

  it('remove creates an ACCESS_REMOVED notification for the share\'s (former) user', async () => {
    const service = await buildService();
    prismaMock.share.findFirst.mockResolvedValue({ id: 's1', fileId: 'f1', userId: 'user_2' });
    prismaMock.share.delete.mockResolvedValue({ id: 's1' });

    await service.remove('f1', 's1', 'owner_1', 'Q3 Roadmap');

    expect(notificationsServiceMock.create).toHaveBeenCalledWith({
      recipientId: 'user_2',
      actorId: 'owner_1',
      type: 'ACCESS_REMOVED',
      file: { id: 'f1', name: 'Q3 Roadmap' },
    });
  });
});
