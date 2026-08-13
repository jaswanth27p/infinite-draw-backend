import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { File } from '@prisma/client';
import { FilesService } from './files.service';
import { REQUIRE_ROLE_KEY } from './require-role.decorator';
import { Role, ROLE_RANK } from './role';

export interface FileAccess {
  file: File;
  role: Role;
}

@Injectable()
export class FileAccessGuard implements CanActivate {
  constructor(
    private readonly filesService: FilesService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { localUserId?: string; fileAccess?: FileAccess }>();

    // No @RequireRole(...) on the handler or controller defaults to the
    // strictest floor (OWNER) — a route that forgets to declare its floor
    // fails closed instead of silently under-protecting a file.
    const minRole =
      this.reflector.getAllAndOverride<Role>(REQUIRE_ROLE_KEY, [context.getHandler(), context.getClass()]) ??
      'OWNER';

    // fileId comes from a route param on most routes (`:id` on
    // FilesController, `:fileId` on FileVersionsController/SharesController)
    // but from the request body on StorageController#presign, which has no
    // file-scoped path segment.
    const params = request.params as Record<string, string>;
    const fileId = params.fileId ?? params.id ?? (request.body as { fileId?: string } | undefined)?.fileId;

    const access = await this.filesService.getAccess(fileId, request.localUserId as string);
    if (!access) {
      throw new NotFoundException('File not found');
    }
    if (ROLE_RANK[access.role] < ROLE_RANK[minRole]) {
      throw new ForbiddenException('Insufficient role for this action');
    }

    request.fileAccess = access;
    return true;
  }
}
