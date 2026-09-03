import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { FileVersionsController } from './file-versions.controller';
import { FileVersionsService } from './file-versions.service';
import { AutoVersionProcessor } from './auto-version.processor';
import { SharesController } from './shares.controller';
import { SharesService } from './shares.service';
import { FileAccessGuard } from './file-access.guard';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule, BullModule.registerQueue({ name: 'file-versioning' })],
  controllers: [FilesController, FileVersionsController, SharesController],
  providers: [FilesService, FileVersionsService, SharesService, FileAccessGuard, AutoVersionProcessor],
  exports: [FilesService, FileVersionsService, FileAccessGuard],
})
export class FilesModule {}
