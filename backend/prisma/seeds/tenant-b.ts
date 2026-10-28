import { hash } from 'bcrypt';
import type { Color, Size } from '../../src/generated/prisma/client.js';
import { Prisma, PrismaClient } from '../../src/generated/prisma/client.js';
import { tenantContext } from '../../src/common/tenant/tenant-context.js';
import { validateSeedPassword } from './base.js';

export const TENANT_B_SLUG = 'empresa-b';
const MARKER = 'SEED:EMPRESA-B:V1';

export interface TenantBOptions {
  password: string;
  saltRounds?: number;
  referenceDate?: string;
}

/**
 * Empresa B de demostracion (plan Basico): sus propias sucursales, usuarios de todos
 * los roles, catalogo, stock, ventas y reservas. Datos ficticios; idempotente.
 */
export async function seedTenantB(
  client: PrismaClient,
  options: TenantBOptions,
) {
  validateSeedPassword(options.password, 'SEED_DEMO_PASSWORD');
  const passwordHash = await hash(options.password, options.saltRounds ?? 12);
  const reference = options.referenceDate
    ? new Date(options.referenceDate + 'T12:00:00-04:00')
    : new Date();
  const daysAgo = (days: number) =>
    new Date(reference.getTime() - days * 86_400_000);

  const tenant = await tenantContext.runAsSystem(async () => {
    const plan = await client.plan.findUniqueOrThrow({
      where: { code: 'BASIC' },
    });
    const existing = await client.tenant.findUnique({
      where: { slug: TENANT_B_SLUG },
    });
    if (existing) return { ...existing, created: false };
    const startsAt = new Date();
    const endsAt = new Date(startsAt);
    endsAt.setUTCMonth(endsAt.getUTCMonth() + 12);
    const created = await client.tenant.create({
      data: {
        name: 'Moda Andina (Empresa B)',
        slug: TENANT_B_SLUG,
        subscription: {
          create: {
            planId: plan.id,
            startsAt,
            endsAt,
            history: {
              create: {
                action: 'ASSIGN',
                toPlanId: plan.id,
                status: 'ACTIVE',
                startsAt,
                endsAt,
                note: MARKER,
              },
            },
          },
        },
      },
    });
    return { ...created, created: true };
  });

  return tenantContext.runInTenant(tenant.id, () =>
    client.$transaction(
      async (prisma) => {
        if (await prisma.branch.count())
          return { tenant: tenant.slug, created: false };
        const roles = Object.fromEntries(
          (await prisma.role.findMany()).map((role) => [role.name, role.id]),
        );
        const branches = [];
        for (const [name, city] of [
          ['Moda Andina Centro', 'La Paz'],
          ['Moda Andina El Alto', 'El Alto'],
        ] as const)
          branches.push(
            await prisma.branch.create({
              data: {
                name,
                city,
                address: 'Direccion ficticia ' + name,
                cashRegisters: { create: { name: 'Caja 1' } },
              },
            }),
          );
        const supplier = await prisma.supplier.create({
          data: { name: 'Tejidos del Altiplano', contact: 'Contacto ficticio' },
        });
        const user = (
          email: string,
          name: string,
          role: string,
          extra: Partial<Prisma.UserCreateInput> = {},
        ) =>
          prisma.user.create({
            data: {
              email,
              name,
              passwordHash,
              roles: { create: { roleId: roles[role]! } },
              ...extra,
            },
            include: { client: true, employee: true },
          });
        const admin = await user(
          'admin@empresa-b.test',
          'Admin Empresa B',
          'ADMINISTRATOR',
        );
        const manager = await user(
          'encargado@empresa-b.test',
          'Encargado Empresa B',
          'BRANCH_MANAGER',
          {
            employee: {
              create: { branchId: branches[0]!.id, jobTitle: 'Encargado' },
            },
          },
        );
        const cashier = await user(
          'cajero@empresa-b.test',
          'Cajero Empresa B',
          'CASHIER',
          {
            employee: {
              create: { branchId: branches[0]!.id, jobTitle: 'Cajero' },
            },
          },
        );
        await user('proveedor@empresa-b.test', 'Proveedor B', 'SUPPLIER', {
          supplier: { connect: { id: supplier.id } },
        });
        const customers = [];
        for (const i of [1, 2])
          customers.push(
            await user(
              `cliente${i}@empresa-b.test`,
              `Cliente ${i} Empresa B`,
              'CUSTOMER',
              { client: { create: { phone: '+591 7000000' + i } } },
            ),
          );

        const sizes: Size[] = [];
        for (const name of ['S', 'M', 'L'])
          sizes.push(await prisma.size.create({ data: { name } }));
        const colors: Color[] = [];
        for (const [name, hexCode] of [
          ['Negro', '#111111'],
          ['Rojo', '#B91C1C'],
        ])
          colors.push(await prisma.color.create({ data: { name, hexCode } }));
        const season = await prisma.season.create({
          data: {
            name: 'Invierno 2026',
            startDate: new Date('2026-01-01'),
            endDate: new Date('2026-12-31'),
          },
        });
        const collection = await prisma.collection.create({
          data: { name: 'Lana andina', seasonId: season.id },
        });
        const products = [];
        for (const [categoryName, productName, price] of [
          ['Chompas', 'Chompa de alpaca', '320.00'],
          ['Chompas', 'Chompa trenzada', '280.00'],
          ['Ponchos', 'Poncho clasico', '450.00'],
          ['Gorros', 'Gorro con orejeras', '90.00'],
        ] as const) {
          const category =
            (await prisma.category.findFirst({
              where: { name: categoryName },
            })) ??
            (await prisma.category.create({ data: { name: categoryName } }));
          products.push(
            await prisma.product.create({
              data: {
                name: productName,
                description: 'Producto ficticio de la Empresa B',
                price,
                categoryId: category.id,
                seasonId: season.id,
                collectionId: collection.id,
                supplierId: supplier.id,
                sizes: { create: sizes.map((size) => ({ sizeId: size.id })) },
                colors: {
                  create: colors.map((color) => ({ colorId: color.id })),
                },
              },
            }),
          );
        }
        for (const branch of branches)
          for (const product of products)
            for (const size of sizes)
              for (const color of colors) {
                const inventory = await prisma.inventory.create({
                  data: {
                    branchId: branch.id,
                    productId: product.id,
                    sizeId: size.id,
                    colorId: color.id,
                    physicalQuantity: 8,
                  },
                });
                await prisma.inventoryMovement.create({
                  data: {
                    inventoryId: inventory.id,
                    type: 'ENTRY',
                    quantity: 8,
                    occurredAt: daysAgo(30),
                    reference: MARKER,
                  },
                });
              }

        const stock = (branchId: number, productId: number) =>
          prisma.inventory.findUniqueOrThrow({
            where: {
              branchId_productId_sizeId_colorId: {
                branchId,
                productId,
                sizeId: sizes[1]!.id,
                colorId: colors[0]!.id,
              },
            },
          });
        for (let i = 0; i < 6; i++) {
          const branch = branches[i % 2]!;
          const product = products[i % products.length]!;
          const quantity = 1 + (i % 2);
          const total = product.price.mul(quantity);
          const soldAt = daysAgo(1 + i * 3);
          const sale = await prisma.sale.create({
            data: {
              branchId: branch.id,
              clientId: customers[i % 2]!.client!.id,
              employeeId: cashier.employee!.id,
              createdById: cashier.id,
              channel: 'IN_STORE',
              status: 'COMPLETED',
              total,
              soldAt,
              confirmedAt: soldAt,
              items: {
                create: {
                  productId: product.id,
                  sizeId: sizes[1]!.id,
                  colorId: colors[0]!.id,
                  quantity,
                  unitPrice: product.price,
                  productName: product.name,
                  sizeName: sizes[1]!.name,
                  colorName: colors[0]!.name,
                },
              },
              payments: {
                create: {
                  method: 'CASH',
                  type: 'IN_STORE',
                  status: 'APPROVED',
                  amount: total,
                  paidAt: soldAt,
                },
              },
            },
          });
          const inventory = await stock(branch.id, product.id);
          await prisma.inventory.update({
            where: { id: inventory.id },
            data: { physicalQuantity: { decrement: quantity } },
          });
          await prisma.inventoryMovement.create({
            data: {
              inventoryId: inventory.id,
              type: 'SALE',
              quantity,
              occurredAt: soldAt,
              reference: 'SALE:' + sale.id,
              observation: MARKER,
            },
          });
        }
        for (const [i, customer] of customers.entries()) {
          const branch = branches[i]!;
          const product = products[i]!;
          const approximateTime = new Date(reference.getTime() + 86_400_000);
          const reservation = await prisma.reservation.create({
            data: {
              clientId: customer.client!.id,
              branchId: branch.id,
              approximateTime,
              expiresAt: new Date(approximateTime.getTime() + 8 * 3_600_000),
              observation: MARKER,
              items: {
                create: {
                  productId: product.id,
                  sizeId: sizes[1]!.id,
                  colorId: colors[0]!.id,
                  quantity: 1,
                },
              },
            },
          });
          const inventory = await stock(branch.id, product.id);
          await prisma.inventory.update({
            where: { id: inventory.id },
            data: { reservedQuantity: { increment: 1 } },
          });
          await prisma.inventoryMovement.create({
            data: {
              inventoryId: inventory.id,
              type: 'RESERVATION',
              quantity: 1,
              reference: 'RESERVATION:' + reservation.id,
            },
          });
        }
        return {
          tenant: tenant.slug,
          created: true,
          branches: branches.length,
          products: products.length,
          users: 6,
          admin: admin.email,
          manager: manager.email,
          sales: 6,
          reservations: customers.length,
        };
      },
      { timeout: 60_000 },
    ),
  );
}
