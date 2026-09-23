import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { PushController } from './push.controller.js';
import { PushService } from './push.service.js';

@Module({
  imports: [ConfigModule, PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
