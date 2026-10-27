import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { NextFunction, Request, Response } from 'express';
import {
  TenantStore,
  tenantContext,
} from '../../common/tenant/tenant-context.js';
import { TenantsService } from './tenants.service.js';

export const TENANT_HEADER = 'x-tenant';

/**
 * Abre el contexto de empresa de cada peticion. Prioridad:
 * 1. empresa de un JWT valido (tambien en rutas publicas como el catalogo);
 * 2. header `X-Tenant` (tienda publica por empresa);
 * 3. slug por defecto (apps del parcial 1 que no envian el header).
 * Un header distinto a la empresa del token se rechaza. Los guards JWT vuelven a
 * validar el usuario contra la base y fijan su empresa real.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly jwt: JwtService;

  constructor(
    private readonly tenants: TenantsService,
    config: ConfigService,
  ) {
    this.jwt = new JwtService({
      secret: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async use(request: Request, _response: Response, next: NextFunction) {
    const header = request.header(TENANT_HEADER)?.trim();
    const store: TenantStore = {
      tenantId: null,
      system: false,
      source: 'none',
    };
    const fromHeader = header
      ? await this.tenants.requireActiveBySlug(header)
      : undefined;
    const tokenTenant = this.tokenTenant(request);
    if (tokenTenant !== undefined) {
      if (fromHeader && tokenTenant !== null && fromHeader.id !== tokenTenant)
        throw new ForbiddenException({
          code: 'TENANT_MISMATCH',
          message: 'La sesion pertenece a otra empresa',
        });
      Object.assign(store, {
        tenantId: tokenTenant ?? fromHeader?.id ?? null,
        source: 'jwt',
      });
    } else if (fromHeader) {
      Object.assign(store, {
        tenantId: fromHeader.id,
        tenantSlug: fromHeader.slug,
        source: 'header',
      });
    } else {
      const tenant = await this.tenants.findBySlug(this.tenants.defaultSlug);
      if (tenant?.active)
        Object.assign(store, {
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          source: 'default',
        });
    }
    tenantContext.run(store, () => next());
  }

  /** Empresa del token si es valido y la declara; undefined si no aplica. */
  private tokenTenant(request: Request): number | null | undefined {
    const authorization = request.header('authorization');
    if (!authorization?.startsWith('Bearer ')) return undefined;
    try {
      const payload = this.jwt.verify<{ tenantId?: number | null }>(
        authorization.slice(7),
      );
      return payload.tenantId;
    } catch {
      return undefined;
    }
  }
}
