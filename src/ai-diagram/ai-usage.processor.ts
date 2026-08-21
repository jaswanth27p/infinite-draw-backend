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
    // Fixed jobId makes this idempotent across restarts/deploys — BullMQ
    // won't create a second repeatable job for the same id.
    await this.queue.add(
      'sweep-stale-reservations',
      {},
      { repeat: { every: SWEEP_INTERVAL_MS }, jobId: 'ai-usage-sweep' },
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
