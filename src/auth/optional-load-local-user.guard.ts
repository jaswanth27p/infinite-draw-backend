import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
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
    if (user) {
      request.localUserId = user.id;
    }
    return true;
  }
}
