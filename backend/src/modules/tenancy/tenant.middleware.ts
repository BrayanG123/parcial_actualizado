import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import {
  TenantStore,
  tenantContext,
} from '../../common/tenant/tenant-context.js';
import { TenantsService } from './tenants.service.js';

export const TENANT_HEADER = 'x-tenant';

/**
 * Abre el contexto de empresa de cada peticion.
 *
 * Rutas publicas: empresa del header `X-Tenant` o, si falta, el slug por defecto
 * (apps del parcial 1). Para usuarios autenticados la estrategia JWT reemplaza el
 * tenant por el del usuario; un header distinto al del token se rechaza.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly tenants: TenantsService) {}

  async use(request: Request, response: Response, next: NextFunction) {
    const header = request.header(TENANT_HEADER)?.trim();
    const store: TenantStore = {
      tenantId: null,
      system: false,
      source: 'none',
    };
    if (header) {
      const tenant = await this.tenants.requireActiveBySlug(header);
      Object.assign(store, {
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
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
}
