import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { ClerkAuthGuard } from './clerk-auth.guard';
import { LoadLocalUserGuard } from './load-local-user.guard';

@Module({
  controllers: [MeController],
  providers: [ClerkAuthGuard, LoadLocalUserGuard],
  exports: [ClerkAuthGuard, LoadLocalUserGuard],
})
export class AuthModule {}
