import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { FilesModule } from '../files/files.module';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';
import { ThumbnailSweepService } from './thumbnail-sweep.service';
import { ThumbnailSweepProcessor } from './thumbnail-sweep.processor';

@Module({
  imports: [FilesModule, BullModule.registerQueue({ name: 'thumbnail-sweep' })],
  controllers: [StorageController],
  providers: [StorageService, ThumbnailSweepService, ThumbnailSweepProcessor],
  exports: [StorageService],
})
export class StorageModule {}
