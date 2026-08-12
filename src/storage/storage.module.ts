import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';

@Module({
  imports: [FilesModule],
  controllers: [StorageController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
