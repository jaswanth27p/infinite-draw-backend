import { AiUsageProcessor } from './ai-usage.processor';
import { CreditsService } from '../credits/credits.service';

describe('AiUsageProcessor', () => {
  const creditsServiceMock = {
    refundUsage: jest.fn(),
    sweepStaleReservations: jest.fn(),
  };
  const queueMock = { add: jest.fn(), upsertJobScheduler: jest.fn() };

  function buildProcessor() {
    return new AiUsageProcessor(creditsServiceMock as unknown as CreditsService, queueMock as never);
  }

  beforeEach(() => jest.clearAllMocks());

  it('refunds the reservation named in a release-stale-reservation job', async () => {
    const processor = buildProcessor();

    await processor.process({ name: 'release-stale-reservation', data: { reservationId: 'res_1' } } as never);

    expect(creditsServiceMock.refundUsage).toHaveBeenCalledWith('res_1');
  });

  it('runs the sweep for a sweep-stale-reservations job', async () => {
    const processor = buildProcessor();

    await processor.process({ name: 'sweep-stale-reservations', data: {} } as never);

    expect(creditsServiceMock.sweepStaleReservations).toHaveBeenCalledWith(5 * 60 * 1000);
  });

  it('schedules the repeatable sweep job on module init via a fixed jobSchedulerId', async () => {
    const processor = buildProcessor();

    await processor.onModuleInit();

    expect(queueMock.upsertJobScheduler).toHaveBeenCalledWith(
      'ai-usage-sweep',
      { every: 5 * 60 * 1000 },
      { name: 'sweep-stale-reservations', data: {} },
    );
  });
});
