import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  HttpException,
  HttpStatus,
  Injectable,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { SignupTenantDto } from './dto/platform.dto.js';
import { PlatformService } from './platform.service.js';

const SIGNUP_WINDOW_MS = 15 * 60 * 1000;
const SIGNUPS_PER_WINDOW = 5;

/** Limite por IP del alta publica de empresas: evita crear empresas en masa. */
@Injectable()
export class SignupRateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, number[]>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const key = request.ip ?? 'unknown';
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter(
      (time) => now - time < SIGNUP_WINDOW_MS,
    );
    if (recent.length >= SIGNUPS_PER_WINDOW)
      throw new HttpException(
        'Demasiados registros de empresas desde esta red; intenta mas tarde',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5000)
      for (const [ip, times] of this.hits)
        if (!times.some((time) => now - time < SIGNUP_WINDOW_MS))
          this.hits.delete(ip);
    return true;
  }
}

/**
 * Landing SaaS publica: planes disponibles y alta autoservicio de una empresa con su
 * administrador. El pago es simulado (no hay cobro real en el prototipo academico).
 */
@Controller('saas')
export class SaasController {
  constructor(private readonly platform: PlatformService) {}

  @Get('plans')
  plans() {
    return this.platform.publicPlans();
  }

  @Post('signup')
  @UseGuards(SignupRateLimitGuard)
  signup(@Body() dto: SignupTenantDto) {
    return this.platform.signup(dto);
  }
}
