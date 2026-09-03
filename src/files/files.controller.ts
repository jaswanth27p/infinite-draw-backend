import {
  Body,
  Controller,
  Get,
  Delete,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { LoadLocalUserGuard } from '../auth/load-local-user.guard';
import { OptionalClerkAuthGuard } from '../auth/optional-clerk-auth.guard';
import { OptionalLoadLocalUserGuard } from '../auth/optional-load-local-user.guard';
import { CurrentLocalUserId } from '../auth/current-local-user-id.decorator';
import { FileAccessGuard } from './file-access.guard';
import { RequireRole } from './require-role.decorator';
import { AllowDeleted } from './allow-deleted.decorator';
import { CurrentFileAccess, type FileAccess } from './current-file-access.decorator';
import { FilesService } from './files.service';
import { UpdateFileDto } from './dto/update-file.dto';
import { UpdateGeneralAccessDto } from './dto/update-general-access.dto';

function clampLimit(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, 50);
}

const SHARE_ROLE_VALUES = ['VIEWER', 'COMMENTER', 'EDITOR'] as const;
type ShareRoleFilter = (typeof SHARE_ROLE_VALUES)[number];

// Postgres throws a hard runtime error for an unrecognized value in an
// enum-typed WHERE clause (`invalid input value for enum "ShareRole"`),
// not a silent zero-row match — confirmed directly against a live
// instance. An unvalidated ?role= query param would 500 the whole
// request instead of degrading gracefully, so a garbage/typo'd value is
// treated as "no filter" here rather than ever reaching Prisma.
function parseRoleFilter(raw: string | undefined): ShareRoleFilter | undefined {
  return SHARE_ROLE_VALUES.includes(raw as ShareRoleFilter) ? (raw as ShareRoleFilter) : undefined;
}

@Controller('files')
@UseGuards(OptionalClerkAuthGuard, OptionalLoadLocalUserGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get()
  @UseGuards(ClerkAuthGuard, LoadLocalUserGuard)
  async list(
    @CurrentLocalUserId() ownerId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
  ) {
    return this.filesService.list(ownerId, cursor, clampLimit(limit, 30), q);
  }

  @Post()
  @UseGuards(ClerkAuthGuard, LoadLocalUserGuard)
  create(@CurrentLocalUserId() ownerId: string) {
    return this.filesService.create(ownerId);
  }

  @Get('shared')
  @UseGuards(ClerkAuthGuard, LoadLocalUserGuard)
  async shared(
    @CurrentLocalUserId() userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
    @Query('role') role?: string,
  ) {
    return this.filesService.listShared(userId, cursor, clampLimit(limit, 30), q, parseRoleFilter(role));
  }

  @Get('starred')
  @UseGuards(ClerkAuthGuard, LoadLocalUserGuard)
  starred(
    @CurrentLocalUserId() userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
  ) {
    return this.filesService.listStarred(userId, cursor, clampLimit(limit, 30), q);
  }

  @Get('trash')
  @UseGuards(ClerkAuthGuard, LoadLocalUserGuard)
  trash(
    @CurrentLocalUserId() userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
  ) {
    return this.filesService.listTrash(userId, cursor, clampLimit(limit, 30), q);
  }

  // Must stay declared before @Get(':id') below -- Nest matches routes in
  // declaration order, and a catch-all :id param route declared first
  // would swallow /files/search as id: 'search'.
  @Get('search')
  @UseGuards(ClerkAuthGuard, LoadLocalUserGuard)
  async search(
    @CurrentLocalUserId() userId: string,
    @Query('q') q: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.filesService.search(userId, q ?? '', cursor, clampLimit(limit, 30));
  }

  @Get(':id')
  @UseGuards(FileAccessGuard)
  @RequireRole('VIEWER')
  async get(@CurrentFileAccess() access: FileAccess) {
    // A VIEWER can never send chat messages (send-chat-message requires
    // COMMENTER+, see CollabGateway#hasFloor) and is the role every
    // anonymous request resolves to for a generalAccess: ANYONE file
    // (FilesService#getAccess) -- so a VIEWER has no legitimate use for
    // owner info, and including it here would leak the owner's email to
    // any unauthenticated visitor with a public file link.
    const owner = access.role === 'VIEWER' ? null : await this.filesService.getOwnerInfo(access.file.ownerId);
    return { ...access.file, role: access.role, owner };
  }

  @Patch(':id')
  @UseGuards(ClerkAuthGuard, LoadLocalUserGuard, FileAccessGuard)
  @RequireRole('EDITOR')
  update(@Param('id') id: string, @Body() dto: UpdateFileDto) {
    return this.filesService.update(id, dto);
  }

  @Patch(':id/general-access')
  @UseGuards(ClerkAuthGuard, LoadLocalUserGuard, FileAccessGuard)
  @RequireRole('OWNER')
  generalAccess(@Param('id') id: string, @Body() dto: UpdateGeneralAccessDto) {
    return this.filesService.updateGeneralAccess(id, dto);
  }

  @Delete(':id')
  @UseGuards(ClerkAuthGuard, LoadLocalUserGuard, FileAccessGuard)
  @RequireRole('OWNER')
  remove(@CurrentFileAccess() access: FileAccess) {
    return this.filesService.softDelete(access.file.id);
  }

  @Post(':id/restore')
  @UseGuards(ClerkAuthGuard, LoadLocalUserGuard, FileAccessGuard)
  @RequireRole('OWNER')
  @AllowDeleted()
  restore(@CurrentFileAccess() access: FileAccess) {
    return this.filesService.restore(access.file.id);
  }

  @Delete(':id/permanent')
  @UseGuards(ClerkAuthGuard, LoadLocalUserGuard, FileAccessGuard)
  @RequireRole('OWNER')
  @AllowDeleted()
  permanentDelete(@CurrentFileAccess() access: FileAccess) {
    return this.filesService.permanentDelete(access.file.id);
  }

  @Post(':id/star')
  @UseGuards(ClerkAuthGuard, LoadLocalUserGuard, FileAccessGuard)
  @RequireRole('VIEWER')
  star(@CurrentFileAccess() access: FileAccess, @CurrentLocalUserId() userId: string) {
    return this.filesService.star(userId, access.file.id);
  }

  @Delete(':id/star')
  @UseGuards(ClerkAuthGuard, LoadLocalUserGuard, FileAccessGuard)
  @RequireRole('VIEWER')
  unstar(@CurrentFileAccess() access: FileAccess, @CurrentLocalUserId() userId: string) {
    return this.filesService.unstar(userId, access.file.id);
  }
}
