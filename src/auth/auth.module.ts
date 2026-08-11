import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { ClerkAuthGuard } from './clerk-auth.guard';

@Module({
  controllers: [MeController],
  providers: [ClerkAuthGuard],
  exports: [ClerkAuthGuard],
})
export class AuthModule {}
