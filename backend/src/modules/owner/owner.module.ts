import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PlatformModule } from '../platform/platform.module.js';
import { OwnerAuthController, OwnerController } from './owner.controller.js';
import { OwnerJwtGuard } from './owner-jwt.guard.js';
import { OwnerService } from './owner.service.js';

@Module({
  imports: [AuthModule, PlatformModule],
  controllers: [OwnerAuthController, OwnerController],
  providers: [OwnerService, OwnerJwtGuard],
})
export class OwnerModule {}
