import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { verifyToken } from '@clerk/backend';
import type { Socket } from 'socket.io';

type AuthedSocket = Socket & { data: { userId?: string } };

@Injectable()
export class WsClerkGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<AuthedSocket>();

    // Verify the Clerk token once per connection, not once per message.
    // Clerk session tokens are short-lived (~60s), and the token captured
    // at handshake time never changes on a live socket — re-verifying it
    // on every message would start rejecting all traffic on that socket
    // once the token expires. Caching the verified identity here relies on
    // the client guaranteeing a fresh token per *connection* attempt
    // (initial connect and every reconnect), so nothing on a live,
    // already-verified socket is ever running against a stale token.
    if (client.data.userId) {
      return true;
    }

    const token = client.handshake.auth?.token as string | undefined;

    if (!token) {
      throw new WsException('Missing auth token');
    }

    try {
      const { sub } = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY as string,
      });
      client.data.userId = sub;
      return true;
    } catch {
      throw new WsException('Invalid auth token');
    }
  }
}
