import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ReportsController } from './reports.controller.js';
import { ReportsRepository } from './reports.repository.js';
import { ReportsService } from './reports.service.js';
@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [ReportsController],
  providers: [ReportsRepository, ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
