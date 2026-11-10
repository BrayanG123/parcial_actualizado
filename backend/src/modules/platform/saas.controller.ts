import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Injectable,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { SignupTenantDto } from './dto/platform.dto.js';
import { PlatformService } from './platform.service.js';
import { SubscriptionBillingService } from './subscription-billing.service.js';

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
 * administrador. Los planes de pago se cobran con Stripe (modo prueba) y la empresa se
 * crea recien cuando el pago se confirma.
 */
@Controller('saas')
export class SaasController {
  constructor(
    private readonly platform: PlatformService,
    private readonly billing: SubscriptionBillingService,
  ) {}

  @Get('plans')
  plans() {
    return this.platform.publicPlans();
  }

  @Post('signup')
  @UseGuards(SignupRateLimitGuard)
  signup(@Body() dto: SignupTenantDto) {
    return this.billing.signup(dto);
  }

  /** Estado de un pago de suscripcion; si Stripe ya lo cobro, aplica su efecto. */
  @Post('payments/:id/confirm')
  @HttpCode(200)
  confirm(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.billing.confirm(id);
  }
}
