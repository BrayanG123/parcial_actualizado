import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module.js';
import {
  PlatformAuthController,
  PlatformController,
} from './platform.controller.js';
import { PlatformService } from './platform.service.js';

@Module({
  imports: [AuthModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [PlatformAuthController, PlatformController],
  providers: [PlatformService],
})
export class PlatformModule {}
