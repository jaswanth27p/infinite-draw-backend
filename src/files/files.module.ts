import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { FileVersionsController } from './file-versions.controller';
import { FileVersionsService } from './file-versions.service';

@Module({
  controllers: [FilesController, FileVersionsController],
  providers: [FilesService, FileVersionsService],
  exports: [FilesService, FileVersionsService],
})
export class FilesModule {}
