import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { from, switchMap } from 'rxjs';
import { tenantContext } from '../../common/tenant/tenant-context.js';
import { ALLOW_READ_ONLY_KEY, PLAN_FEATURE_KEY } from './plan.decorators.js';
import {
  PlanFeature,
  SubscriptionAccessService,
} from './subscription-access.service.js';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Reglas del plan y de la suscripcion para cada peticion con empresa:
 * - `@RequiresFeature(...)`: el plan debe incluir la funcionalidad;
 * - suscripcion vencida o suspendida => solo lectura (escrituras 403).
 * Es un interceptor y no un guard global porque debe ejecutarse despues de los
 * guards de JWT, cuando ya se conoce la empresa real del usuario.
 */
@Injectable()
export class TenantAccessInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: SubscriptionAccessService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    if (context.getType() !== 'http') return next.handle();
    const store = tenantContext.getStore();
    if (!store || store.system || store.tenantId === null) return next.handle();
    const targets = [context.getHandler(), context.getClass()];
    const feature = this.reflector.getAllAndOverride<PlanFeature | undefined>(
      PLAN_FEATURE_KEY,
      targets,
    );
    const method = context.switchToHttp().getRequest<Request>().method;
    const checkWrite =
      !READ_METHODS.has(method) &&
      !this.reflector.getAllAndOverride<boolean>(ALLOW_READ_ONLY_KEY, targets);
    if (!feature && !checkWrite) return next.handle();
    return from(this.check(feature, checkWrite)).pipe(
      switchMap(() => next.handle()),
    );
  }

  private async check(feature: PlanFeature | undefined, checkWrite: boolean) {
    if (feature) await this.access.assertFeature(feature);
    if (checkWrite) await this.access.assertWritable();
  }
}
