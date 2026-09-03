import { ExecutionContext } from '@nestjs/common';
import * as clerkExpress from '@clerk/express';
import { OptionalLoadLocalUserGuard } from './optional-load-local-user.guard';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('@clerk/express', () => ({ getAuth: jest.fn() }));

describe('OptionalLoadLocalUserGuard', () => {
  const prismaMock = { user: { findUnique: jest.fn() } };

  function buildContext(request: Record<string, unknown>): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => jest.clearAllMocks());

  it('leaves localUserId undefined when there is no Clerk session', async () => {
    (clerkExpress.getAuth as jest.Mock).mockReturnValue({ userId: null });
    const guard = new OptionalLoadLocalUserGuard(prismaMock as never);
    const request: Record<string, unknown> = {};

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);
    expect(request.localUserId).toBeUndefined();
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('sets localUserId when a valid session has a synced local user', async () => {
    (clerkExpress.getAuth as jest.Mock).mockReturnValue({ userId: 'clerk_1' });
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user_1' });
    const guard = new OptionalLoadLocalUserGuard(prismaMock as never);
    const request: Record<string, unknown> = {};

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);
    expect(request.localUserId).toBe('user_1');
  });

  it('leaves localUserId undefined when the session has no synced local user yet (no throw)', async () => {
    (clerkExpress.getAuth as jest.Mock).mockReturnValue({ userId: 'clerk_1' });
    prismaMock.user.findUnique.mockResolvedValue(null);
    const guard = new OptionalLoadLocalUserGuard(prismaMock as never);
    const request: Record<string, unknown> = {};

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);
    expect(request.localUserId).toBeUndefined();
  });
});
