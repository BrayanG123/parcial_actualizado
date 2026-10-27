import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import {
  ALLOW_READ_ONLY_KEY,
  PLAN_FEATURE_KEY,
} from '../../modules/tenancy/plan.decorators.js';

export interface RouteInfo {
  method: string;
  path: string;
  handler: string;
  guards: string[];
  roles: string[];
  feature?: string;
  allowWhenReadOnly: boolean;
}

type Ctor = new (...args: never[]) => unknown;
const join = (...parts: string[]) =>
  '/' +
  parts
    .flatMap((p) => p.split('/'))
    .filter(Boolean)
    .join('/');
const asList = (value: unknown): string[] =>
  Array.isArray(value) ? (value as string[]) : value ? [String(value)] : [];

/**
 * Inventario de rutas a partir de los metadatos de Nest (decoradores), sin levantar la
 * aplicacion. Lo usan las pruebas de seguridad para exigir autenticacion y roles.
 */
export function routeInventory(controllers: Ctor[]): RouteInfo[] {
  const routes: RouteInfo[] = [];
  for (const controller of controllers) {
    const prefixes = asList(Reflect.getMetadata(PATH_METADATA, controller));
    const proto = controller.prototype as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(proto)) {
      const handler = proto[name];
      if (name === 'constructor' || typeof handler !== 'function') continue;
      const verb = Reflect.getMetadata(METHOD_METADATA, handler) as
        RequestMethod | undefined;
      if (verb === undefined) continue;
      const guards = [
        ...((Reflect.getMetadata(GUARDS_METADATA, controller) as Ctor[]) ?? []),
        ...((Reflect.getMetadata(GUARDS_METADATA, handler) as Ctor[]) ?? []),
      ].map((g) => g.name);
      const meta = (key: string) =>
        (Reflect.getMetadata(key, handler) ??
          Reflect.getMetadata(key, controller)) as unknown;
      for (const prefix of prefixes.length ? prefixes : ['']) {
        for (const path of asList(Reflect.getMetadata(PATH_METADATA, handler)))
          routes.push({
            method: RequestMethod[verb],
            path: join(prefix, path),
            handler: `${controller.name}.${name}`,
            guards,
            roles: asList(meta(ROLES_KEY)),
            feature: meta(PLAN_FEATURE_KEY) as string | undefined,
            allowWhenReadOnly: Boolean(meta(ALLOW_READ_ONLY_KEY)),
          });
      }
    }
  }
  return routes.sort((a, b) =>
    `${a.path} ${a.method}`.localeCompare(`${b.path} ${b.method}`),
  );
}
