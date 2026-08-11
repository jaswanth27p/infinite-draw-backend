import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { parseRedisUrl } from '../redis/redis.module';

@Module({
  imports: [
    BullModule.forRoot({
      connection: parseRedisUrl(process.env.REDIS_URL as string),
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
