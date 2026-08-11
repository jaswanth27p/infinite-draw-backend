import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { getAuth } from '@clerk/express';
import type { Request } from 'express';

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const auth = getAuth(request);

    if (!auth?.userId) {
      throw new UnauthorizedException();
    }

    return true;
  }
}
