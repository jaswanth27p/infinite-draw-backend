import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { getAuth } from '@clerk/express';
import type { Request } from 'express';

// Never throws — populates nothing itself (that's OptionalLoadLocalUserGuard's
// job); exists only so a route can run without ClerkAuthGuard's hard 401
// while still calling getAuth() the same way every other guard does. A
// route using this MUST also apply FilesService.getAccess with a
// possibly-undefined userId to actually enforce anything.
@Injectable()
export class OptionalClerkAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    getAuth(request);
    return true;
  }
}
