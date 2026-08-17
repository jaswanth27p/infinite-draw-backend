import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

type AuthedSocket = Socket & { data: { userId?: string; localUserId?: string } };

@Injectable()
export class WsLocalUserGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<AuthedSocket>();

    if (client.data.localUserId) {
      return true;
    }

    const user = await this.prisma.user.findUnique({ where: { clerkId: client.data.userId } });
    if (!user) {
      throw new WsException('Local user record not found — Clerk webhook may not have synced yet');
    }

    client.data.localUserId = user.id;
    return true;
  }
}
