import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { InventoryController } from './inventory.controller.js';
import { InventoryRepository } from './inventory.repository.js';
import { InventoryService } from './inventory.service.js';
import { MovementsService } from './movements.service.js';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryRepository, MovementsService],
  exports: [InventoryService, MovementsService],
})
export class InventoryModule {}
