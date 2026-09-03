import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import * as crypto from 'crypto';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { LoadLocalUserGuard } from '../auth/load-local-user.guard';
import { FileAccessGuard } from '../files/file-access.guard';
import { RequireRole } from '../files/require-role.decorator';
import { StorageService } from './storage.service';
import { PresignDto } from './dto/presign.dto';

const THUMBNAIL_CONTENT_TYPE = 'image/png';

const IMAGE_CONTENT_TYPE_EXTENSION: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

@Controller('storage')
@UseGuards(ClerkAuthGuard, LoadLocalUserGuard)
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('presign')
  @UseGuards(FileAccessGuard)
  @RequireRole('EDITOR')
  async presign(@Body() dto: PresignDto) {
    const kind = dto.kind ?? 'thumbnail';
    const key =
      kind === 'thumbnail'
        ? `thumbnails/${dto.fileId}/${crypto.randomUUID()}.png`
        : `images/${dto.fileId}/${crypto.randomUUID()}.${IMAGE_CONTENT_TYPE_EXTENSION[dto.contentType as string]}`;
    const contentType = kind === 'thumbnail' ? THUMBNAIL_CONTENT_TYPE : (dto.contentType as string);
    const uploadUrl = await this.storageService.getPresignedUploadUrl(key, contentType);
    const publicUrl = this.storageService.getPublicUrl(key);
    return { uploadUrl, key, publicUrl };
  }
}
