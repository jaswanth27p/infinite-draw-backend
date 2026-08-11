import { NotFoundException } from '@nestjs/common';
import { getAuth } from '@clerk/express';
import { LoadLocalUserGuard } from './load-local-user.guard';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('@clerk/express', () => ({
  getAuth: jest.fn(),
}));

function createContext() {
  const request: { localUserId?: string } = {};
  return {
    context: {
      switchToHttp: () => ({ getRequest: () => request }),
    } as any,
    request,
  };
}

describe('LoadLocalUserGuard', () => {
  const mockedGetAuth = getAuth as jest.Mock;
  const prismaMock = { user: { findUnique: jest.fn() } };

  beforeEach(() => jest.clearAllMocks());

  it('attaches the local user id when a matching User row exists', async () => {
    mockedGetAuth.mockReturnValue({ userId: 'user_clerk_1' });
    prismaMock.user.findUnique.mockResolvedValue({ id: 'local_1' });
    const guard = new LoadLocalUserGuard(prismaMock as unknown as PrismaService);
    const { context, request } = createContext();

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.localUserId).toBe('local_1');
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { clerkId: 'user_clerk_1' },
    });
  });

  it('throws NotFoundException when no local User row exists yet', async () => {
    mockedGetAuth.mockReturnValue({ userId: 'user_clerk_2' });
    prismaMock.user.findUnique.mockResolvedValue(null);
    const guard = new LoadLocalUserGuard(prismaMock as unknown as PrismaService);
    const { context } = createContext();

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(NotFoundException);
  });
});
