import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { tenantContext } from '../../common/tenant/tenant-context.js';
import {
  TenantArgsScoper,
  buildTenantModelMap,
  tenantIsolationExtension,
} from './tenant-isolation.extension.js';

// El modelo de datos en tiempo de ejecucion no necesita conexion a la base.
const client = new PrismaClient({
  adapter: new PrismaPg({ connectionString: 'postgresql://x:y@localhost/z' }),
});
const map = buildTenantModelMap(
  (client as unknown as { _runtimeDataModel: never })._runtimeDataModel,
);
const scoper = new TenantArgsScoper(map);

describe('tenant isolation', () => {
  it('classifies business models as tenant scoped and keeps platform tables global', () => {
    for (const model of ['Product', 'Sale', 'SaleItem', 'User', 'Branch'])
      expect(map.tenantModels.has(model)).toBe(true);
    for (const model of ['Tenant', 'Plan', 'Role', 'UserRole'])
      expect(map.tenantModels.has(model)).toBe(false);
    expect(map.relations.get('Product')?.get('category')).toEqual({
      target: 'Category',
      ownsForeignKey: true,
    });
    expect(map.relations.get('Sale')?.get('items')?.ownsForeignKey).toBe(false);
  });

  it('adds the tenant to filters of reads, updates and deletes', () => {
    for (const operation of [
      'findUnique',
      'findMany',
      'count',
      'groupBy',
      'update',
      'deleteMany',
    ])
      expect(
        scoper.scope('Product', operation, { where: { id: 3 } }, 7).where,
      ).toEqual({ id: 3, tenantId: 7 });
    expect(scoper.scope('Sale', 'aggregate', {}, 7).where).toEqual({
      tenantId: 7,
    });
  });

  it('overrides a tenant sent by the caller and never moves rows to another tenant', () => {
    expect(
      scoper.scope('Branch', 'findMany', { where: { tenantId: 99 } }, 7).where,
    ).toEqual({ tenantId: 7 });
    expect(
      scoper.scope(
        'Branch',
        'update',
        { where: { id: 1 }, data: { tenantId: 99, name: 'X' } },
        7,
      ).data,
    ).toEqual({ name: 'X' });
  });

  it('sets the tenant on unchecked creates and their nested children', () => {
    const { data } = scoper.scope(
      'Sale',
      'create',
      {
        data: {
          branchId: 1,
          total: 10,
          items: { create: [{ productId: 1, quantity: 1 }] },
          payments: { create: { amount: 10 } },
        },
      },
      7,
    );
    expect(data).toEqual({
      branchId: 1,
      total: 10,
      tenantId: 7,
      items: { create: [{ productId: 1, quantity: 1, tenantId: 7 }] },
      payments: { create: { amount: 10, tenantId: 7 } },
    });
  });

  it('uses a relation connect when the create mixes nested to-one relations', () => {
    const { data } = scoper.scope(
      'Product',
      'create',
      {
        data: {
          name: 'Camisa',
          category: { create: { name: 'Camisas' } },
          season: { connect: { id: 2 } },
        },
      },
      7,
    ) as { data: Record<string, unknown> };
    expect(data.tenant).toEqual({ connect: { id: 7 } });
    expect(data.tenantId).toBeUndefined();
    expect(data.category).toEqual({
      create: { name: 'Camisas', tenantId: 7 },
    });
    // Conectar un registro de otra empresa no encuentra el registro.
    expect(data.season).toEqual({ connect: { id: 2, tenantId: 7 } });
  });

  it('scopes createMany rows and upserts', () => {
    expect(
      scoper.scope('Inventory', 'createMany', { data: [{ branchId: 1 }] }, 7)
        .data,
    ).toEqual([{ branchId: 1, tenantId: 7 }]);
    const upsert = scoper.scope(
      'CashRegister',
      'upsert',
      { where: { id: 1 }, create: { branchId: 1, name: 'Caja' }, update: {} },
      7,
    );
    expect(upsert.where).toEqual({ id: 1, tenantId: 7 });
    expect(upsert.create).toEqual({ branchId: 1, name: 'Caja', tenantId: 7 });
  });

  it('fails closed without tenant context and lets explicit system tasks through', async () => {
    const queries: unknown[] = [];
    const fake = {
      $extends: (extension: {
        query: {
          $allModels: {
            $allOperations: (input: Record<string, unknown>) => unknown;
          };
        };
      }) => extension,
      _runtimeDataModel: (client as unknown as { _runtimeDataModel: unknown })
        ._runtimeDataModel,
    };
    const extension = (
      tenantIsolationExtension() as unknown as (c: unknown) => {
        query: {
          $allModels: {
            $allOperations: (input: Record<string, unknown>) => unknown;
          };
        };
      }
    )(fake).query.$allModels.$allOperations;
    const call = () =>
      extension({
        model: 'Product',
        operation: 'findMany',
        args: {},
        query: (args: unknown) => queries.push(args),
      });
    expect(call).toThrow('Tenant context required');
    tenantContext.runAsSystem(call);
    tenantContext.runInTenant(5, call);
    expect(queries).toEqual([{}, { where: { tenantId: 5 } }]);
  });
});
