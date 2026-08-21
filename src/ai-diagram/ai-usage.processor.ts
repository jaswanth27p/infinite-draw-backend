import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { CreditsService } from '../credits/credits.service';

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
@Processor('ai-usage')
export class AiUsageProcessor extends WorkerHost implements OnModuleInit {
  constructor(
    private readonly creditsService: CreditsService,
    @InjectQueue('ai-usage') private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    // Fixed jobSchedulerId makes this idempotent across restarts/deploys —
    // BullMQ v6 upserts the scheduler rather than creating a duplicate.
    await this.queue.upsertJobScheduler(
      'ai-usage-sweep',
      { every: SWEEP_INTERVAL_MS },
      { name: 'sweep-stale-reservations', data: {} },
    );
  }

  async process(job: Job<{ reservationId: string }>): Promise<void> {
    if (job.name === 'release-stale-reservation') {
      await this.creditsService.refundUsage(job.data.reservationId);
      return;
    }
    if (job.name === 'sweep-stale-reservations') {
      await this.creditsService.sweepStaleReservations(SWEEP_INTERVAL_MS);
      return;
    }
  }
}
