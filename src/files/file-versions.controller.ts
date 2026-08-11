import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { LoadLocalUserGuard } from '../auth/load-local-user.guard';
import { CurrentLocalUserId } from '../auth/current-local-user-id.decorator';
import { FileVersionsService } from './file-versions.service';
import { CreateVersionDto } from './dto/create-version.dto';

@Controller('files/:fileId/versions')
@UseGuards(ClerkAuthGuard, LoadLocalUserGuard)
export class FileVersionsController {
  constructor(private readonly versionsService: FileVersionsService) {}

  @Post()
  save(
    @Param('fileId') fileId: string,
    @CurrentLocalUserId() ownerId: string,
    @Body() dto: CreateVersionDto,
  ) {
    return this.versionsService.save(fileId, ownerId, dto.name);
  }

  @Get()
  list(@Param('fileId') fileId: string, @CurrentLocalUserId() ownerId: string) {
    return this.versionsService.list(fileId, ownerId);
  }

  @Post(':versionId/restore')
  restore(
    @Param('fileId') fileId: string,
    @Param('versionId') versionId: string,
    @CurrentLocalUserId() ownerId: string,
  ) {
    return this.versionsService.restore(fileId, versionId, ownerId);
  }
}
