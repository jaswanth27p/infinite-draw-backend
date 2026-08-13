import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { FileAccess } from './file-access.guard';

export type { FileAccess } from './file-access.guard';

export const CurrentFileAccess = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): FileAccess => {
    const request = ctx.switchToHttp().getRequest<Request & { fileAccess?: FileAccess }>();
    return request.fileAccess as FileAccess;
  },
);
