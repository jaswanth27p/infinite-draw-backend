import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';

describe('HealthController', () => {
  it('returns ok when the database responds', async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) },
        },
      ],
    }).compile();

    const controller = module.get(HealthController);
    await expect(controller.check()).resolves.toEqual({ status: 'ok', db: 'ok' });
  });

  it('throws when the database is unreachable', async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: { $queryRaw: jest.fn().mockRejectedValue(new Error('down')) },
        },
      ],
    }).compile();

    const controller = module.get(HealthController);
    await expect(controller.check()).rejects.toThrow();
  });
});
