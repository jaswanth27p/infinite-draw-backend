import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { LoadLocalUserGuard } from '../auth/load-local-user.guard';
import { CurrentLocalUserId } from '../auth/current-local-user-id.decorator';
import { FileAccessGuard } from './file-access.guard';
import { RequireRole } from './require-role.decorator';
import { CurrentFileAccess, type FileAccess } from './current-file-access.decorator';
import { SharesService } from './shares.service';
import { CreateShareDto } from './dto/create-share.dto';
import { UpdateShareDto } from './dto/update-share.dto';

@Controller('files/:fileId/shares')
@UseGuards(ClerkAuthGuard, LoadLocalUserGuard, FileAccessGuard)
@RequireRole('OWNER')
export class SharesController {
  constructor(private readonly sharesService: SharesService) {}

  @Get()
  list(@Param('fileId') fileId: string) {
    return this.sharesService.list(fileId);
  }

  @Post()
  invite(
    @Param('fileId') fileId: string,
    @CurrentLocalUserId() ownerId: string,
    @CurrentFileAccess() access: FileAccess,
    @Body() dto: CreateShareDto,
  ) {
    return this.sharesService.invite(fileId, ownerId, access.file.name, dto);
  }

  @Patch(':shareId')
  updateRole(
    @Param('fileId') fileId: string,
    @Param('shareId') shareId: string,
    @CurrentLocalUserId() ownerId: string,
    @CurrentFileAccess() access: FileAccess,
    @Body() dto: UpdateShareDto,
  ) {
    return this.sharesService.updateRole(fileId, shareId, ownerId, access.file.name, dto);
  }

  @Delete(':shareId')
  remove(
    @Param('fileId') fileId: string,
    @Param('shareId') shareId: string,
    @CurrentLocalUserId() ownerId: string,
    @CurrentFileAccess() access: FileAccess,
  ) {
    return this.sharesService.remove(fileId, shareId, ownerId, access.file.name);
  }
}
