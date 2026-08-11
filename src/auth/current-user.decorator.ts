import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { getAuth } from '@clerk/express';
import type { Request } from 'express';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return getAuth(request).userId as string;
  },
);
