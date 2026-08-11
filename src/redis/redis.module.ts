import { Global, Module } from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

export function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    password: parsed.password || undefined,
  };
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => new Redis(parseRedisUrl(process.env.REDIS_URL as string)),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
