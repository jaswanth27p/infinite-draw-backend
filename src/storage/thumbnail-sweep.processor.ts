import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { ThumbnailSweepService } from './thumbnail-sweep.service';

const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;
// Skip anything newer than this — a thumbnail can be uploaded to storage a
// moment before the File/FileVersion row that references it commits.
const GRACE_MS = 60 * 60 * 1000;

@Injectable()
@Processor('thumbnail-sweep')
export class ThumbnailSweepProcessor extends WorkerHost implements OnModuleInit {
  constructor(
    private readonly sweepService: ThumbnailSweepService,
    @InjectQueue('thumbnail-sweep') private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      'thumbnail-sweep',
      { every: SWEEP_INTERVAL_MS },
      { name: 'sweep-orphaned-thumbnails', data: {} },
    );
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'sweep-orphaned-thumbnails') {
      await this.sweepService.sweep(GRACE_MS);
    }
  }
}
