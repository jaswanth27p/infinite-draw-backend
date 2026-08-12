import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { StorageService } from './storage.service';
import { PresignDto } from './dto/presign.dto';

@Controller('storage')
@UseGuards(ClerkAuthGuard)
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('presign')
  async presign(@Body() dto: PresignDto) {
    const uploadUrl = await this.storageService.getPresignedUploadUrl(dto.key, dto.contentType);
    return { uploadUrl };
  }
}
