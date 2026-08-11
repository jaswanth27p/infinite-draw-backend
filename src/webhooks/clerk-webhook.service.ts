import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface ClerkUserPayload {
  id: string;
  email_addresses: { id: string; email_address: string }[];
  primary_email_address_id: string;
  first_name: string | null;
  last_name: string | null;
  image_url: string | null;
}

interface ClerkEvent {
  type: string;
  data: Record<string, unknown>;
}

@Injectable()
export class ClerkWebhookService {
  private readonly logger = new Logger(ClerkWebhookService.name);

  constructor(private readonly prisma: PrismaService) {}

  async handleEvent(event: ClerkEvent) {
    switch (event.type) {
      case 'user.created':
      case 'user.updated':
        await this.upsertUser(event.data as unknown as ClerkUserPayload);
        break;
      case 'user.deleted':
        await this.deleteUser((event.data as { id: string }).id);
        break;
      default:
        this.logger.debug(`Ignoring unhandled Clerk event: ${event.type}`);
    }
  }

  private async upsertUser(data: ClerkUserPayload) {
    const primaryEmail = data.email_addresses.find(
      (e) => e.id === data.primary_email_address_id,
    )?.email_address;

    if (!primaryEmail) {
      this.logger.warn(`Clerk user ${data.id} has no primary email, skipping`);
      return;
    }

    const name = [data.first_name, data.last_name].filter(Boolean).join(' ') || null;

    await this.prisma.user.upsert({
      where: { clerkId: data.id },
      create: { clerkId: data.id, email: primaryEmail, name, avatarUrl: data.image_url },
      update: { email: primaryEmail, name, avatarUrl: data.image_url },
    });
  }

  private async deleteUser(clerkId: string) {
    await this.prisma.user.deleteMany({ where: { clerkId } });
  }
}
