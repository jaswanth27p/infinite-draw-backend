import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
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
      // 403, not 404: the resource being requested may well exist — it's
      // this account's local User row that hasn't synced yet (the Clerk
      // webhook lags sign-up by a few seconds). A 404 here is
      // indistinguishable from "that file doesn't exist" to callers doing
      // status-code branching.
      throw new ForbiddenException(
        'Local user record not found — Clerk webhook may not have synced yet',
      );
    }

    request.localUserId = user.id;
    return true;
  }
}
