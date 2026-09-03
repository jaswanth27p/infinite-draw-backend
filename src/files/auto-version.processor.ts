import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { FileVersionsService } from './file-versions.service';

const SWEEP_INTERVAL_MS = 60_000;
const IDLE_WINDOW_MS = 5 * 60_000;

@Injectable()
@Processor('file-versioning')
export class AutoVersionProcessor extends WorkerHost implements OnModuleInit {
  constructor(
    private readonly fileVersionsService: FileVersionsService,
    @InjectQueue('file-versioning') private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      'auto-version-sweep',
      { every: SWEEP_INTERVAL_MS },
      { name: 'sweep-idle-files', data: {} },
    );
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'sweep-idle-files') {
      await this.fileVersionsService.sweepIdleFiles(IDLE_WINDOW_MS);
    }
  }
}
