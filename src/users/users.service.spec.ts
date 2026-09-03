import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

describe('UsersService', () => {
  const prismaMock = {
    user: {
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
  };

  function buildService() {
    return new UsersService(prismaMock as unknown as PrismaService);
  }

  beforeEach(() => jest.clearAllMocks());

  it("getNotificationPreferences returns the caller's four preference columns", async () => {
    const service = buildService();
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({
      notifyFileShared: true,
      notifyRoleChanged: false,
      notifyAccessRemoved: true,
      notifyMentioned: true,
    });

    const result = await service.getNotificationPreferences('user_1');

    expect(result).toEqual({
      notifyFileShared: true,
      notifyRoleChanged: false,
      notifyAccessRemoved: true,
      notifyMentioned: true,
    });
    expect(prismaMock.user.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      select: {
        notifyFileShared: true,
        notifyRoleChanged: true,
        notifyAccessRemoved: true,
        notifyMentioned: true,
      },
    });
  });

  it('updateNotificationPreferences only forwards the fields present in the dto, even if extra keys are smuggled on', async () => {
    const service = buildService();
    prismaMock.user.update.mockResolvedValue({
      notifyFileShared: false,
      notifyRoleChanged: true,
      notifyAccessRemoved: true,
      notifyMentioned: true,
    });

    await service.updateNotificationPreferences('user_1', {
      notifyFileShared: false,
      email: 'attacker@evil.com',
    } as never);

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { notifyFileShared: false },
      select: {
        notifyFileShared: true,
        notifyRoleChanged: true,
        notifyAccessRemoved: true,
        notifyMentioned: true,
      },
    });
  });

  it('updateNotificationPreferences forwards notifyMentioned when present', async () => {
    const service = buildService();
    prismaMock.user.update.mockResolvedValue({ notifyMentioned: false });

    await service.updateNotificationPreferences('user_1', { notifyMentioned: false });

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { notifyMentioned: false },
      select: expect.any(Object),
    });
  });

  it('updateNotificationPreferences with an empty dto sends an empty data object (no-op update)', async () => {
    const service = buildService();
    prismaMock.user.update.mockResolvedValue({});

    await service.updateNotificationPreferences('user_1', {});

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: {},
      select: expect.any(Object),
    });
  });
});
