import { AutoVersionProcessor } from './auto-version.processor';
import { FileVersionsService } from './file-versions.service';

describe('AutoVersionProcessor', () => {
  const fileVersionsServiceMock = { sweepIdleFiles: jest.fn() };
  const queueMock = { add: jest.fn(), upsertJobScheduler: jest.fn() };

  function buildProcessor() {
    return new AutoVersionProcessor(fileVersionsServiceMock as unknown as FileVersionsService, queueMock as never);
  }

  beforeEach(() => jest.clearAllMocks());

  it('runs the sweep with the configured idle window for a sweep-idle-files job', async () => {
    const processor = buildProcessor();

    await processor.process({ name: 'sweep-idle-files', data: {} } as never);

    expect(fileVersionsServiceMock.sweepIdleFiles).toHaveBeenCalledWith(5 * 60_000);
  });

  it('schedules the repeatable sweep job on module init via a fixed jobSchedulerId', async () => {
    const processor = buildProcessor();

    await processor.onModuleInit();

    expect(queueMock.upsertJobScheduler).toHaveBeenCalledWith(
      'auto-version-sweep',
      { every: 60_000 },
      { name: 'sweep-idle-files', data: {} },
    );
  });
});
