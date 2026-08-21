import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { FilesModule } from '../files/files.module';
import { CreditsModule } from '../credits/credits.module';
import { AiDiagramController } from './ai-diagram.controller';
import { AiDiagramService } from './ai-diagram.service';
import { AiUsageProcessor } from './ai-usage.processor';

@Module({
  imports: [FilesModule, CreditsModule, BullModule.registerQueue({ name: 'ai-usage' })],
  controllers: [AiDiagramController],
  providers: [AiDiagramService, AiUsageProcessor],
})
export class AiDiagramModule {}
