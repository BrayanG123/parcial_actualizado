import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AiRateLimitGuard } from '../ai/ai-rate-limit.guard.js';
import { VirtualFittingController } from './virtual-fitting.controller.js';
import { VirtualFittingService } from './virtual-fitting.service.js';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [VirtualFittingController],
  providers: [VirtualFittingService, AiRateLimitGuard],
  exports: [VirtualFittingService],
})
export class VirtualFittingModule {}
