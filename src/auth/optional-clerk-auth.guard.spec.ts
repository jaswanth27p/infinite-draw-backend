import { ExecutionContext } from '@nestjs/common';
import * as clerkExpress from '@clerk/express';
import { OptionalClerkAuthGuard } from './optional-clerk-auth.guard';

jest.mock('@clerk/express', () => ({ getAuth: jest.fn() }));

describe('OptionalClerkAuthGuard', () => {
  function buildContext(): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({}) }),
    } as unknown as ExecutionContext;
  }

  it('returns true when there is no session, without throwing', () => {
    (clerkExpress.getAuth as jest.Mock).mockReturnValue({ userId: null });
    const guard = new OptionalClerkAuthGuard();

    expect(guard.canActivate(buildContext())).toBe(true);
  });

  it('returns true when there is a valid session', () => {
    (clerkExpress.getAuth as jest.Mock).mockReturnValue({ userId: 'clerk_1' });
    const guard = new OptionalClerkAuthGuard();

    expect(guard.canActivate(buildContext())).toBe(true);
  });
});
