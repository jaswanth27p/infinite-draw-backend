import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { getAuth } from '@clerk/express';
import { ClerkAuthGuard } from './clerk-auth.guard';

jest.mock('@clerk/express', () => ({
  getAuth: jest.fn(),
}));

function createContext(): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({}) }),
  } as unknown as ExecutionContext;
}

describe('ClerkAuthGuard', () => {
  const mockedGetAuth = getAuth as jest.Mock;

  it('allows the request when a userId is present', () => {
    mockedGetAuth.mockReturnValue({ userId: 'user_123' });
    const guard = new ClerkAuthGuard();
    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('rejects the request when there is no userId', () => {
    mockedGetAuth.mockReturnValue({ userId: null });
    const guard = new ClerkAuthGuard();
    expect(() => guard.canActivate(createContext())).toThrow(UnauthorizedException);
  });
});
