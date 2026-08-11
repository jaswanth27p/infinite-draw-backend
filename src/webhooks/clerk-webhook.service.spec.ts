import { Test } from '@nestjs/testing';
import { ClerkWebhookService } from './clerk-webhook.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ClerkWebhookService', () => {
  const prismaMock = {
    user: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  async function buildService() {
    const module = await Test.createTestingModule({
      providers: [ClerkWebhookService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    return module.get(ClerkWebhookService);
  }

  beforeEach(() => jest.clearAllMocks());

  it('upserts a user on user.created', async () => {
    const service = await buildService();
    await service.handleEvent({
      type: 'user.created',
      data: {
        id: 'user_abc',
        email_addresses: [{ id: 'em_1', email_address: 'a@example.com' }],
        primary_email_address_id: 'em_1',
        first_name: 'Ada',
        last_name: 'Lovelace',
        image_url: 'https://example.com/a.png',
      },
    });

    expect(prismaMock.user.upsert).toHaveBeenCalledWith({
      where: { clerkId: 'user_abc' },
      create: {
        clerkId: 'user_abc',
        email: 'a@example.com',
        name: 'Ada Lovelace',
        avatarUrl: 'https://example.com/a.png',
      },
      update: {
        email: 'a@example.com',
        name: 'Ada Lovelace',
        avatarUrl: 'https://example.com/a.png',
      },
    });
  });

  it('deletes a user on user.deleted', async () => {
    const service = await buildService();
    await service.handleEvent({ type: 'user.deleted', data: { id: 'user_abc' } });
    expect(prismaMock.user.deleteMany).toHaveBeenCalledWith({ where: { clerkId: 'user_abc' } });
  });

  it('ignores unrelated events', async () => {
    const service = await buildService();
    await service.handleEvent({ type: 'session.created', data: {} });
    expect(prismaMock.user.upsert).not.toHaveBeenCalled();
  });
});
