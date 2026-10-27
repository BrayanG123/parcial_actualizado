import { SetMetadata } from '@nestjs/common';
import type { PlanFeature } from './subscription-access.service.js';

export const PLAN_FEATURE_KEY = 'planFeature';
export const ALLOW_READ_ONLY_KEY = 'allowWhenReadOnly';

/**
 * Exige que el plan de la empresa incluya la funcionalidad. Lo verifica
 * `TenantAccessInterceptor`, que corre despues de todos los guards (JWT incluido),
 * por eso no depende del orden de los decoradores.
 */
export const RequiresFeature = (feature: PlanFeature) =>
  SetMetadata(PLAN_FEATURE_KEY, feature);

/** Escritura permitida aunque la suscripcion este vencida (login, webhook, dispositivos). */
export const AllowWhenReadOnly = () => SetMetadata(ALLOW_READ_ONLY_KEY, true);
