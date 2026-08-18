import { WsException } from '@nestjs/websockets';
import { WsLocalUserGuard } from './ws-local-user.guard';
import { PrismaService } from '../prisma/prisma.service';

function createWsContext(data: Record<string, unknown>) {
  const client = { data };
  return {
    switchToWs: () => ({ getClient: () => client }),
  } as any;
}

describe('WsLocalUserGuard', () => {
  const prismaMock = { user: { findUnique: jest.fn() } };

  beforeEach(() => jest.clearAllMocks());

  it('attaches localUserId when a matching User row exists', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'local_1',
      name: 'Alice',
      email: 'alice@example.com',
    });
    const guard = new WsLocalUserGuard(prismaMock as unknown as PrismaService);
    const context = createWsContext({ userId: 'clerk_1' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(context.switchToWs().getClient().data.localUserId).toBe('local_1');
    expect(context.switchToWs().getClient().data.displayName).toBe('Alice');
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { clerkId: 'clerk_1' },
    });
  });

  it('falls back to email for displayName when the user has no name set', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'local_1',
      name: null,
      email: 'alice@example.com',
    });
    const guard = new WsLocalUserGuard(prismaMock as unknown as PrismaService);
    const context = createWsContext({ userId: 'clerk_1' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(context.switchToWs().getClient().data.displayName).toBe(
      'alice@example.com',
    );
  });

  it('skips the database lookup when localUserId is already cached on the connection', async () => {
    const guard = new WsLocalUserGuard(prismaMock as unknown as PrismaService);
    const context = createWsContext({
      userId: 'clerk_1',
      localUserId: 'local_1',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('throws WsException when no local User row exists yet', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const guard = new WsLocalUserGuard(prismaMock as unknown as PrismaService);
    const context = createWsContext({ userId: 'clerk_2' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      WsException,
    );
  });
});
