import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { getAuth } from '@clerk/express';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OptionalLoadLocalUserGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { localUserId?: string }>();
    const clerkId = getAuth(request).userId;
    if (!clerkId) {
      return true;
    }
    const user = await this.prisma.user.findUnique({ where: { clerkId } });
    if (!user) {
      // A real Clerk session exists (clerkId resolved) but this account's
      // local User row hasn't synced yet — same provisioning-lag case
      // LoadLocalUserGuard rejects with 403, not "treat as anonymous."
      // A 404-shaped anonymous fallthrough here would be indistinguishable
      // from "file doesn't exist," same reasoning as LoadLocalUserGuard.
      throw new ForbiddenException(
        'Local user record not found — Clerk webhook may not have synced yet',
      );
    }
    request.localUserId = user.id;
    return true;
  }
}
