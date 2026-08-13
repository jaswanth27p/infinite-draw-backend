import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { FileVersionsController } from './file-versions.controller';
import { FileVersionsService } from './file-versions.service';
import { SharesController } from './shares.controller';
import { SharesService } from './shares.service';
import { FileAccessGuard } from './file-access.guard';

@Module({
  controllers: [FilesController, FileVersionsController, SharesController],
  providers: [FilesService, FileVersionsService, SharesService, FileAccessGuard],
  exports: [FilesService, FileVersionsService, FileAccessGuard],
})
export class FilesModule {}
