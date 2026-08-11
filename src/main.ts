import { NestFactory } from '@nestjs/core';
import { clerkMiddleware } from '@clerk/express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? 'http://localhost:3000',
    credentials: true,
  });

  app.use(clerkMiddleware());

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
