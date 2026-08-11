import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { LoadLocalUserGuard } from '../auth/load-local-user.guard';
import { CurrentLocalUserId } from '../auth/current-local-user-id.decorator';
import { FilesService } from './files.service';
import { UpdateFileDto } from './dto/update-file.dto';

@Controller('files')
@UseGuards(ClerkAuthGuard, LoadLocalUserGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get()
  list(@CurrentLocalUserId() ownerId: string) {
    return this.filesService.list(ownerId);
  }

  @Post()
  create(@CurrentLocalUserId() ownerId: string) {
    return this.filesService.create(ownerId);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentLocalUserId() ownerId: string) {
    return this.filesService.getOwned(id, ownerId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentLocalUserId() ownerId: string,
    @Body() dto: UpdateFileDto,
  ) {
    return this.filesService.update(id, ownerId, dto);
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
