import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { LoadLocalUserGuard } from '../auth/load-local-user.guard';
import { FileAccessGuard } from './file-access.guard';
import { RequireRole } from './require-role.decorator';
import { CurrentFileAccess, type FileAccess } from './current-file-access.decorator';
import { FileVersionsService } from './file-versions.service';
import { CreateVersionDto } from './dto/create-version.dto';

@Controller('files/:fileId/versions')
@UseGuards(ClerkAuthGuard, LoadLocalUserGuard)
export class FileVersionsController {
  constructor(private readonly versionsService: FileVersionsService) {}

  @Post()
  @UseGuards(FileAccessGuard)
  @RequireRole('EDITOR')
  save(@CurrentFileAccess() access: FileAccess, @Body() dto: CreateVersionDto) {
    return this.versionsService.save(access.file, dto.name, dto.thumbnailUrl);
  }

  @Get()
  @UseGuards(FileAccessGuard)
  @RequireRole('VIEWER')
  list(@Param('fileId') fileId: string) {
    return this.versionsService.list(fileId);
  }

  @Post(':versionId/restore')
  @UseGuards(FileAccessGuard)
  @RequireRole('EDITOR')
  restore(@CurrentFileAccess() access: FileAccess, @Param('versionId') versionId: string) {
    return this.versionsService.restore(access.file, versionId);
  }
}
