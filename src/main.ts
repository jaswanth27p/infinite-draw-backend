import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { clerkMiddleware } from '@clerk/express';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './realtime/redis-io.adapter';
import { getCorsOrigins } from './config/cors';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  app.enableCors({
    origin: getCorsOrigins(),
    credentials: true,
  });

  app.use(clerkMiddleware());

  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
