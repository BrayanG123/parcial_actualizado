import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { AiRateLimitGuard } from '../ai/ai-rate-limit.guard.js';
import { TryOnDto } from './dto/try-on.dto.js';
import { VirtualFittingService } from './virtual-fitting.service.js';

@Controller('virtual-fitting')
export class VirtualFittingController {
  constructor(private readonly virtualFittingService: VirtualFittingService) {}

  /** Indica si el probador con IA esta habilitado, sin exponer claves. */
  @Get('status')
  status() {
    return this.virtualFittingService.status();
  }

  /** Solo con sesion: cada imagen consume cuota del proveedor. */
  @Post('try-on')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, AiRateLimitGuard)
  tryOn(@Body() dto: TryOnDto) {
    return this.virtualFittingService.tryOn(dto);
  }
}
