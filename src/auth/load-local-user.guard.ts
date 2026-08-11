import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { getAuth } from '@clerk/express';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LoadLocalUserGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { localUserId?: string }>();
    const clerkId = getAuth(request).userId as string;

    const user = await this.prisma.user.findUnique({ where: { clerkId } });
    if (!user) {
      throw new NotFoundException('Local user record not found — Clerk webhook may not have synced yet');
    }

    request.localUserId = user.id;
    return true;
  }
}
