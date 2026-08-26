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

@Controller('files')
@UseGuards(ClerkAuthGuard, LoadLocalUserGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get()
  async list(
    @CurrentLocalUserId() ownerId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.filesService.list(ownerId, cursor, clampLimit(limit, 30));
  }

  @Post()
  create(@CurrentLocalUserId() ownerId: string) {
    return this.filesService.create(ownerId);
  }

  @Get('shared')
  async shared(
    @CurrentLocalUserId() userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.filesService.listShared(userId, cursor, clampLimit(limit, 30));
  }

  @Get('starred')
  starred(
    @CurrentLocalUserId() userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.filesService.listStarred(userId, cursor, clampLimit(limit, 30));
  }

  @Get('trash')
  trash(
    @CurrentLocalUserId() userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.filesService.listTrash(userId, cursor, clampLimit(limit, 30));
  }

  @Get(':id')
  @UseGuards(FileAccessGuard)
  @RequireRole('VIEWER')
  get(@CurrentFileAccess() access: FileAccess) {
    return { ...access.file, role: access.role };
  }

  @Patch(':id')
  @UseGuards(FileAccessGuard)
  @RequireRole('EDITOR')
  update(@Param('id') id: string, @Body() dto: UpdateFileDto) {
    return this.filesService.update(id, dto);
  }

  @Patch(':id/general-access')
  @UseGuards(FileAccessGuard)
  @RequireRole('OWNER')
  generalAccess(@Param('id') id: string, @Body() dto: UpdateGeneralAccessDto) {
    return this.filesService.updateGeneralAccess(id, dto);
  }

  @Delete(':id')
  @UseGuards(FileAccessGuard)
  @RequireRole('OWNER')
  remove(@CurrentFileAccess() access: FileAccess) {
    return this.filesService.softDelete(access.file.id);
  }

  @Post(':id/restore')
  @UseGuards(FileAccessGuard)
  @RequireRole('OWNER')
  @AllowDeleted()
  restore(@CurrentFileAccess() access: FileAccess) {
    return this.filesService.restore(access.file.id);
  }

  @Delete(':id/permanent')
  @UseGuards(FileAccessGuard)
  @RequireRole('OWNER')
  @AllowDeleted()
  permanentDelete(@CurrentFileAccess() access: FileAccess) {
    return this.filesService.permanentDelete(access.file.id);
  }

  @Post(':id/star')
  @UseGuards(FileAccessGuard)
  @RequireRole('VIEWER')
  star(@CurrentFileAccess() access: FileAccess, @CurrentLocalUserId() userId: string) {
    return this.filesService.star(userId, access.file.id);
  }

  @Delete(':id/star')
  @UseGuards(FileAccessGuard)
  @RequireRole('VIEWER')
  unstar(@CurrentFileAccess() access: FileAccess, @CurrentLocalUserId() userId: string) {
    return this.filesService.unstar(userId, access.file.id);
  }
}
