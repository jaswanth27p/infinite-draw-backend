import { WsException } from '@nestjs/websockets';
import { verifyToken } from '@clerk/backend';
import { WsClerkGuard } from './ws-clerk.guard';

jest.mock('@clerk/backend', () => ({
  verifyToken: jest.fn(),
}));

function createWsContext(token?: string) {
  const client = { handshake: { auth: { token } }, data: {} as Record<string, unknown> };
  return {
    switchToWs: () => ({ getClient: () => client }),
  } as any;
}

describe('WsClerkGuard', () => {
  const mockedVerifyToken = verifyToken as jest.Mock;

  it('allows the connection and attaches userId when the token is valid', async () => {
    mockedVerifyToken.mockResolvedValue({ sub: 'user_123' });
    const guard = new WsClerkGuard();
    await expect(guard.canActivate(createWsContext('valid-token'))).resolves.toBe(true);
  });

  it('rejects when there is no token', async () => {
    const guard = new WsClerkGuard();
    await expect(guard.canActivate(createWsContext(undefined))).rejects.toBeInstanceOf(
      WsException,
    );
  });

  it('rejects when verification fails', async () => {
    mockedVerifyToken.mockRejectedValue(new Error('bad token'));
    const guard = new WsClerkGuard();
    await expect(guard.canActivate(createWsContext('bad-token'))).rejects.toBeInstanceOf(
      WsException,
    );
  });
});
