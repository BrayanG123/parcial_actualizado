import { Prisma } from '../../generated/prisma/client.js';
import {
  MissingTenantContextError,
  tenantContext,
} from '../../common/tenant/tenant-context.js';

/**
 * Aislamiento multitenant en la capa de datos (RNF02).
 *
 * Toda consulta de Prisma sobre un modelo con `tenantId`:
 * - en lecturas, actualizaciones y borrados agrega `tenantId` al `where`
 *   (un recurso de otra empresa "no existe" y el servicio responde 404);
 * - en altas fija `tenantId` (tambien en altas anidadas y `connect` anidados);
 * - en actualizaciones descarta cualquier intento de cambiar `tenantId`.
 *
 * Sin contexto de empresa la consulta falla (fail closed), salvo que se ejecute con
 * `tenantContext.runAsSystem`. Las consultas `$queryRaw` NO pasan por aqui: deben
 * filtrar `id_empresa` explicitamente.
 */

interface RuntimeField {
  name: string;
  kind: string;
  type: string;
}
interface RuntimeDataModel {
  models: Record<string, { fields: RuntimeField[] }>;
}

interface RelationInfo {
  target: string;
  /** Relacion a uno con FK propia (`category` <-> `categoryId`). */
  ownsForeignKey: boolean;
}

export interface TenantModelMap {
  tenantModels: Set<string>;
  relations: Map<string, Map<string, RelationInfo>>;
}

export function buildTenantModelMap(
  dataModel: RuntimeDataModel,
): TenantModelMap {
  const tenantModels = new Set<string>();
  const relations = new Map<string, Map<string, RelationInfo>>();
  for (const [model, { fields }] of Object.entries(dataModel.models)) {
    const scalars = new Set(
      fields.filter((f) => f.kind === 'scalar').map((f) => f.name),
    );
    if (scalars.has('tenantId')) tenantModels.add(model);
    const modelRelations = new Map<string, RelationInfo>();
    for (const field of fields.filter((f) => f.kind === 'object')) {
      modelRelations.set(field.name, {
        target: field.type,
        ownsForeignKey: scalars.has(`${field.name}Id`),
      });
    }
    relations.set(model, modelRelations);
  }
  return { tenantModels, relations };
}

type Data = Record<string, unknown>;

const isObject = (value: unknown): value is Data =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Date) &&
  !Prisma.Decimal.isDecimal(value);

const each = (value: unknown, callback: (item: Data) => Data): unknown =>
  Array.isArray(value)
    ? value.map((item) => (isObject(item) ? callback(item) : item))
    : isObject(value)
      ? callback(value)
      : value;

const READ_OR_FILTER_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
]);

export class TenantArgsScoper {
  constructor(private readonly map: TenantModelMap) {}

  isTenantModel(model: string): boolean {
    return this.map.tenantModels.has(model);
  }

  scope(model: string, operation: string, args: Data, tenantId: number): Data {
    const scoped: Data = { ...args };
    if (READ_OR_FILTER_OPERATIONS.has(operation)) {
      scoped.where = { ...(isObject(args.where) ? args.where : {}), tenantId };
    }
    switch (operation) {
      case 'create':
        scoped.data = this.createData(model, args.data as Data, tenantId);
        break;
      case 'createMany':
      case 'createManyAndReturn':
        scoped.data = each(args.data, (item) => ({
          ...this.stripTenant(item),
          tenantId,
        }));
        break;
      case 'update':
      case 'updateMany':
      case 'updateManyAndReturn':
        scoped.data = this.updateData(model, args.data as Data, tenantId);
        break;
      case 'upsert':
        scoped.where = { ...(args.where as Data), tenantId };
        scoped.create = this.createData(model, args.create as Data, tenantId);
        scoped.update = this.updateData(model, args.update as Data, tenantId);
        break;
    }
    return scoped;
  }

  private stripTenant(data: Data): Data {
    const { tenantId: _tenantId, tenant: _tenant, ...rest } = data;
    return rest;
  }

  /** Alta de una fila: `tenantId` escalar o `tenant: { connect }` segun el estilo de `data`. */
  createData(model: string, data: Data, tenantId: number): Data {
    if (!isObject(data)) return data;
    const relations = this.map.relations.get(model) ?? new Map();
    const result = this.nested(model, this.stripTenant(data), tenantId);
    if (!this.map.tenantModels.has(model)) return result;
    // Prisma no permite mezclar FK escalares con relaciones anidadas a uno (`category: {...}`).
    const checked = Object.keys(data).some(
      (key) => relations.get(key)?.ownsForeignKey,
    );
    return checked
      ? { ...result, tenant: { connect: { id: tenantId } } }
      : { ...result, tenantId };
  }

  private updateData(model: string, data: Data, tenantId: number): Data {
    if (!isObject(data)) return data;
    return this.nested(model, this.stripTenant(data), tenantId);
  }

  /** Recorre relaciones anidadas: altas, upserts y `connect` quedan dentro de la empresa. */
  private nested(model: string, data: Data, tenantId: number): Data {
    const relations = this.map.relations.get(model);
    if (!relations) return data;
    const result: Data = { ...data };
    for (const [key, value] of Object.entries(data)) {
      const relation = relations.get(key);
      if (!relation || !isObject(value)) continue;
      const target = relation.target;
      const scopedTarget = this.map.tenantModels.has(target);
      const ops: Data = { ...value };
      if ('create' in ops)
        ops.create = each(ops.create, (item) =>
          this.createData(target, item, tenantId),
        );
      if (isObject(ops.createMany) && scopedTarget)
        ops.createMany = {
          ...ops.createMany,
          data: each(ops.createMany.data, (item) => ({
            ...this.stripTenant(item),
            tenantId,
          })),
        };
      if ('connectOrCreate' in ops)
        ops.connectOrCreate = each(ops.connectOrCreate, (item) => ({
          ...item,
          where: scopedTarget
            ? { ...(item.where as Data), tenantId }
            : item.where,
          create: this.createData(target, item.create as Data, tenantId),
        }));
      if ('upsert' in ops)
        ops.upsert = each(ops.upsert, (item) => ({
          ...item,
          ...(scopedTarget && isObject(item.where)
            ? { where: { ...item.where, tenantId } }
            : {}),
          create: this.createData(target, item.create as Data, tenantId),
          update: this.updateData(target, item.update as Data, tenantId),
        }));
      if ('connect' in ops && scopedTarget)
        ops.connect = each(ops.connect, (item) => ({ ...item, tenantId }));
      if (isObject(ops.update) && !('where' in ops.update))
        ops.update = this.updateData(target, ops.update, tenantId);
      result[key] = ops;
    }
    return result;
  }
}

export interface TenantIsolationOptions {
  /** Solo pruebas: empresa usada cuando no hay contexto (fixtures directos). */
  fallbackTenantId?: number;
}

export function tenantIsolationExtension(options: TenantIsolationOptions = {}) {
  return Prisma.defineExtension((client) => {
    const dataModel = (
      client as unknown as { _runtimeDataModel: RuntimeDataModel }
    )._runtimeDataModel;
    const scoper = new TenantArgsScoper(buildTenantModelMap(dataModel));
    return client.$extends({
      name: 'tenant-isolation',
      query: {
        $allModels: {
          $allOperations({ model, operation, args, query }) {
            if (!scoper.isTenantModel(model)) return query(args);
            const store = tenantContext.getStore();
            if (store?.system) return query(args);
            const tenantId = store?.tenantId ?? options.fallbackTenantId;
            if (tenantId === null || tenantId === undefined)
              throw new MissingTenantContextError(model, operation);
            return query(
              scoper.scope(model, operation, (args ?? {}) as Data, tenantId),
            );
          },
        },
      },
    });
  });
}
