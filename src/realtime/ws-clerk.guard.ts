import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { verifyToken } from '@clerk/backend';
import type { Socket } from 'socket.io';

@Injectable()
export class WsClerkGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<Socket>();
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
