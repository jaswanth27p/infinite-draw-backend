import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { LoadLocalUserGuard } from '../auth/load-local-user.guard';
import { CurrentLocalUserId } from '../auth/current-local-user-id.decorator';
import { FilesService } from '../files/files.service';
import { StorageService } from './storage.service';
import { PresignDto } from './dto/presign.dto';

const THUMBNAIL_CONTENT_TYPE = 'image/png';

@Controller('storage')
@UseGuards(ClerkAuthGuard, LoadLocalUserGuard)
export class StorageController {
  constructor(
    private readonly storageService: StorageService,
    private readonly filesService: FilesService,
  ) {}

  @Post('presign')
  async presign(@Body() dto: PresignDto, @CurrentLocalUserId() ownerId: string) {
    await this.filesService.getOwned(dto.fileId, ownerId);
    // A distinct key per upload — a fixed `thumbnails/${fileId}.png` key
    // would have every version's thumbnail overwrite the last one's.
    const key = `thumbnails/${dto.fileId}/${Date.now()}.png`;
    const uploadUrl = await this.storageService.getPresignedUploadUrl(key, THUMBNAIL_CONTENT_TYPE);
    const publicUrl = this.storageService.getPublicUrl(key);
    return { uploadUrl, key, publicUrl };
  }
}
