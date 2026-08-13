import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { LoadLocalUserGuard } from '../auth/load-local-user.guard';
import { FileAccessGuard } from '../files/file-access.guard';
import { RequireRole } from '../files/require-role.decorator';
import { StorageService } from './storage.service';
import { PresignDto } from './dto/presign.dto';

const THUMBNAIL_CONTENT_TYPE = 'image/png';

@Controller('storage')
@UseGuards(ClerkAuthGuard, LoadLocalUserGuard)
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('presign')
  @UseGuards(FileAccessGuard)
  @RequireRole('EDITOR')
  async presign(@Body() dto: PresignDto) {
    const key = `thumbnails/${dto.fileId}/${Date.now()}.png`;
    const uploadUrl = await this.storageService.getPresignedUploadUrl(key, THUMBNAIL_CONTENT_TYPE);
    const publicUrl = this.storageService.getPublicUrl(key);
    return { uploadUrl, key, publicUrl };
  }
}
