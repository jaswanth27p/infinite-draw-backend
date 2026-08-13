import {
  Body,
  Controller,
  Get,
  Delete,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { LoadLocalUserGuard } from '../auth/load-local-user.guard';
import { CurrentLocalUserId } from '../auth/current-local-user-id.decorator';
import { FileAccessGuard } from './file-access.guard';
import { RequireRole } from './require-role.decorator';
import { CurrentFileAccess, type FileAccess } from './current-file-access.decorator';
import { FilesService } from './files.service';
import { UpdateFileDto } from './dto/update-file.dto';
import { UpdateGeneralAccessDto } from './dto/update-general-access.dto';

@Controller('files')
@UseGuards(ClerkAuthGuard, LoadLocalUserGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get()
  async list(@CurrentLocalUserId() ownerId: string) {
    const [owned, sharedWithMe] = await Promise.all([
      this.filesService.list(ownerId),
      this.filesService.listShared(ownerId),
    ]);
    return { owned, sharedWithMe };
  }

  @Post()
  create(@CurrentLocalUserId() ownerId: string) {
    return this.filesService.create(ownerId);
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
  remove(@Param('id') id: string, @CurrentLocalUserId() ownerId: string) {
    return this.filesService.softDelete(id, ownerId);
  }

  @Post(':id/restore')
  restore(@Param('id') id: string, @CurrentLocalUserId() ownerId: string) {
    return this.filesService.restore(id, ownerId);
  }
}
