import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { LoadLocalUserGuard } from '../auth/load-local-user.guard';
import { CurrentLocalUserId } from '../auth/current-local-user-id.decorator';
import { FileAccessGuard } from './file-access.guard';
import { RequireRole } from './require-role.decorator';
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
    @Body() dto: CreateShareDto,
  ) {
    return this.sharesService.invite(fileId, ownerId, dto);
  }

  @Patch(':shareId')
  updateRole(
    @Param('fileId') fileId: string,
    @Param('shareId') shareId: string,
    @Body() dto: UpdateShareDto,
  ) {
    return this.sharesService.updateRole(fileId, shareId, dto);
  }

  @Delete(':shareId')
  remove(@Param('fileId') fileId: string, @Param('shareId') shareId: string) {
    return this.sharesService.remove(fileId, shareId);
  }
}
