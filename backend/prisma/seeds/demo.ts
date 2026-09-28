import { hash } from 'bcrypt';
import type { Color, Product } from '../../src/generated/prisma/client.js';
import {
  Prisma,
  PrismaClient,
  ReservationStatus,
  SaleChannel,
} from '../../src/generated/prisma/client.js';
import { seedBase, SeedOptions, validateSeedPassword } from './base.js';
import { createReservationNotification } from '../../src/modules/notifications/reservation-notification.js';

async function ensureDemoNotifications(prisma: Prisma.TransactionClient) {
  const reservations = await prisma.reservation.findMany({
    where: { observation: { startsWith: 'DEMO:V1:RESERVATION:' } },
    include: { items: true },
  });
  let added = 0;
  for (const reservation of reservations)
    added += (await createReservationNotification(prisma, reservation)).count;
  return added;
}

export interface DemoSeedOptions extends SeedOptions {
  demoPassword: string;
  referenceDate?: string;
}
const key = (number: number) =>
  'de000001-0000-4000-8000-' + String(number).padStart(12, '0');
export async function seedDemo(client: PrismaClient, options: DemoSeedOptions) {
  validateSeedPassword(options.demoPassword, 'SEED_DEMO_PASSWORD');
  const date =
    options.referenceDate ??
    new Date(Date.now() - 4 * 3600000).toISOString().slice(0, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    throw new Error('SEED_DEMO_DATE must be a real YYYY-MM-DD date');
  const base = await seedBase(client, options);
  const passwordHash = await hash(
    options.demoPassword,
    options.saltRounds ?? 12,
  );
  const at = (daysAgo: number) =>
    new Date(Date.parse(date + 'T16:00:00Z') - daysAgo * 86400000);
  return client.$transaction(
    async (prisma) => {
      await prisma.$executeRaw`SELECT pg_advisory_xact_lock(731201)`;
      if (
        await prisma.sale.findUnique({
          where: {
            createdById_idempotencyKey: {
              createdById: base.admin.id,
              idempotencyKey: key(33),
            },
          },
        })
      )
        return {
          created: false,
          referenceDate: date,
          notificationsAdded: await ensureDemoNotifications(prisma),
        };
      if (
        await prisma.branch.count({
          where: { name: { startsWith: 'DEMO - ' } },
        })
      )
        throw new Error(
          'DEMO branches already exist without the complete fixture marker; use a fresh demo database or review existing data',
        );
      const branches = [];
      const employees = [];
      for (const [index, city] of [
        'La Paz',
        'Cochabamba',
        'Santa Cruz',
      ].entries()) {
        const branch = await prisma.branch.create({
          data: {
            name: 'DEMO - ' + city,
            city,
            address: 'Dirección de demostración ' + (index + 1),
          },
        });
        branches.push(branch);
        for (const role of ['BRANCH_MANAGER', 'CASHIER'] as const) {
          const alias = role === 'BRANCH_MANAGER' ? 'encargado' : 'cajero';
          const user = await prisma.user.create({
            data: {
              name: alias + ' DEMO ' + city,
              email: alias + (index + 1) + '@demo.fashionstore.test',
              passwordHash,
              roles: {
                create: {
                  roleId: base.roles.find((entry) => entry.name === role)!.id,
                },
              },
              employee: { create: { branchId: branch.id, jobTitle: alias } },
            },
            include: { employee: true },
          });
          if (role === 'CASHIER') employees.push(user.employee!);
        }
      }
      const customers = [];
      for (let i = 1; i <= 4; i++) {
        const user = await prisma.user.create({
          data: {
            name: 'Cliente DEMO ' + i,
            email: 'cliente' + i + '@demo.fashionstore.test',
            passwordHash,
            roles: {
              create: {
                roleId: base.roles.find((entry) => entry.name === 'CUSTOMER')!
                  .id,
              },
            },
            client: {
              create: { address: 'Dirección ficticia de demostración' },
            },
          },
          include: { client: true },
        });
        customers.push(user.client!);
      }
      const sizes = await Promise.all(
        ['S', 'M', 'L'].map((name) =>
          prisma.size.upsert({ where: { name }, update: {}, create: { name } }),
        ),
      );
      const colors: Color[] = [];
      for (const [name, hexCode] of [
        ['Negro', '#111111'],
        ['Blanco', '#FFFFFF'],
      ])
        colors.push(
          await prisma.color.upsert({
            where: { name },
            update: {},
            create: { name, hexCode },
          }),
        );
      const supplier = await prisma.supplier.create({
        data: {
          name: 'DEMO - Textiles del Sur',
          email: 'proveedor@demo.fashionstore.test',
        },
      });
      const season = await prisma.season.create({
        data: {
          name: 'DEMO - Temporada vigente',
          startDate: at(180),
          endDate: at(-180),
        },
      });
      const collection = await prisma.collection.create({
        data: { seasonId: season.id, name: 'DEMO - Colección urbana' },
      });
      const products: Product[] = [];
      for (const [categoryIndex, categoryName] of [
        'Poleras',
        'Pantalones',
        'Chaquetas',
        'Vestidos',
      ].entries()) {
        const category = await prisma.category.upsert({
          where: { name: categoryName },
          update: {},
          create: { name: categoryName },
        });
        for (let n = 1; n <= 3; n++) {
          const product = await prisma.product.create({
            data: {
              name: 'DEMO - ' + categoryName + ' modelo ' + n,
              description:
                'Producto ficticio para probar catálogo, compras y reportes',
              price: new Prisma.Decimal(60 + categoryIndex * 70 + n * 15),
              discountPercent: n === 2 ? 10 : 0,
              imageUrl:
                'https://placehold.co/800x1000?text=' +
                encodeURIComponent(categoryName + ' ' + n),
              categoryId: category.id,
              seasonId: season.id,
              collectionId: collection.id,
              supplierId: supplier.id,
              sizes: { create: sizes.map((size) => ({ sizeId: size.id })) },
              colors: {
                create: colors.map((color) => ({ colorId: color.id })),
              },
            },
          });
          products.push(product);
        }
      }
      for (const [b, branch] of branches.entries()) {
        for (const [p, product] of products.entries())
          for (const [s, size] of sizes.entries())
            for (const [c, color] of colors.entries()) {
              const quantity =
                s === 0 && c === 0 ? ((p + b) % 2 === 0 ? 0 : 3) : 30;
              await prisma.inventory.create({
                data: {
                  branchId: branch.id,
                  productId: product.id,
                  sizeId: size.id,
                  colorId: color.id,
                  physicalQuantity: quantity,
                  ...(quantity
                    ? {
                        movements: {
                          create: {
                            type: 'ENTRY',
                            quantity,
                            occurredAt: at(35),
                            reference: 'DEMO:V1:OPENING',
                          },
                        },
                      }
                    : {}),
                },
              });
            }
      }
      const variant = (index: number) => ({
        productId: products[index % products.length]!.id,
        sizeId: sizes[1]!.id,
        colorId: colors[index % 2]!.id,
      });
      const getStock = (branchId: number, item: ReturnType<typeof variant>) =>
        prisma.inventory.findUniqueOrThrow({
          where: { branchId_productId_sizeId_colorId: { branchId, ...item } },
        });
      for (let i = 0; i < 30; i++) {
        const branch = branches[i % 3]!;
        const customer = customers[i % 4]!;
        const channel: SaleChannel =
          i % 5 === 0 ? 'WEB' : i % 5 === 1 ? 'MOBILE' : 'IN_STORE';
        const item = variant(i);
        const product = products[i % products.length]!;
        const quantity = 1 + (i % 3);
        const discount = product.price
          .mul(product.discountPercent)
          .div(100)
          .toDecimalPlaces(2);
        const total = product.price.minus(discount).mul(quantity);
        const soldAt = at(i);
        const cart =
          channel === 'IN_STORE'
            ? null
            : await prisma.cart.create({
                data: {
                  clientId: customer.id,
                  status: 'CONVERTED',
                  createdAt: soldAt,
                  items: {
                    create: {
                      ...item,
                      quantity,
                      unitPrice: product.price.minus(discount),
                    },
                  },
                },
              });
        const sale = await prisma.sale.create({
          data: {
            branchId: branch.id,
            clientId: customer.id,
            employeeId: channel === 'IN_STORE' ? employees[i % 3]!.id : null,
            cartId: cart?.id,
            createdById: base.admin.id,
            idempotencyKey: key(i + 1),
            channel,
            status: 'COMPLETED',
            currency: 'BOB',
            total,
            soldAt,
            confirmedAt: soldAt,
            items: {
              create: {
                ...item,
                quantity,
                unitPrice: product.price,
                discount,
                productName: product.name,
                sizeName: sizes[1]!.name,
                colorName: colors[i % 2]!.name,
              },
            },
            payments: {
              create: {
                method: channel === 'IN_STORE' ? 'CASH' : 'GATEWAY',
                type: channel === 'IN_STORE' ? 'IN_STORE' : 'ELECTRONIC',
                status: 'APPROVED',
                amount: total,
                paidAt: soldAt,
                externalReference: 'DEMO:V1:PAYMENT:' + (i + 1),
              },
            },
          },
        });
        const inventory = await getStock(branch.id, item);
        if (inventory.physicalQuantity < quantity)
          throw new Error('Demo stock invariant violated');
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
            observation: 'Venta ficticia DEMO; no procesada por Stripe',
          },
        });
      }
      for (const [i, status] of Object.values(ReservationStatus).entries()) {
        const branch = branches[i % 3]!;
        const item = variant(i + 2);
        const active = [
          'PENDING',
          'PREPARING',
          'READY',
          'CUSTOMER_PRESENT',
        ].includes(status);
        const appointment = at(active ? -1 : 2);
        const reservation = await prisma.reservation.create({
          data: {
            clientId: customers[i % 4]!.id,
            branchId: branch.id,
            status,
            reservedAt: at(3),
            approximateTime: appointment,
            expiresAt: new Date(
              appointment.toISOString().slice(0, 10) + 'T23:59:59.999-04:00',
            ),
            observation: 'DEMO:V1:RESERVATION:' + i,
            items: {
              create: {
                ...item,
                quantity: 2,
                status: active
                  ? status === 'PENDING'
                    ? 'PENDING'
                    : 'PREPARED'
                  : 'RETURNED',
              },
            },
          },
        });
        const inventory = await getStock(branch.id, item);
        if (active)
          await prisma.inventory.update({
            where: { id: inventory.id },
            data: { reservedQuantity: { increment: 2 } },
          });
        await prisma.inventoryMovement.create({
          data: {
            inventoryId: inventory.id,
            type: 'RESERVATION',
            quantity: 2,
            occurredAt: at(3),
            reference: 'RESERVATION:' + reservation.id,
          },
        });
        if (!active)
          await prisma.inventoryMovement.create({
            data: {
              inventoryId: inventory.id,
              type: 'RESERVATION_RELEASE',
              quantity: 2,
              occurredAt: at(2),
              reference: 'RESERVATION:' + reservation.id,
            },
          });
      }
      for (const [i, customer] of customers.entries())
        await prisma.cart.create({
          data: {
            clientId: customer.id,
            items: {
              create: {
                ...variant(i),
                quantity: 1,
                unitPrice: products[i]!.price.mul(
                  new Prisma.Decimal(100).minus(products[i]!.discountPercent),
                )
                  .div(100)
                  .toDecimalPlaces(2),
              },
            },
          },
        });
      for (let i = 0; i < 3; i++) {
        const item = variant(i + 6),
          product = products[i + 6]!,
          branch = branches[i]!;
        const total = product.price
          .mul(new Prisma.Decimal(100).minus(product.discountPercent))
          .div(100)
          .toDecimalPlaces(2);
        const pending = i === 0;
        const cart = await prisma.cart.create({
          data: {
            clientId: customers[i]!.id,
            status: 'CONVERTED',
            items: { create: { ...item, quantity: 1, unitPrice: total } },
          },
        });
        const sale = await prisma.sale.create({
          data: {
            branchId: branch.id,
            clientId: customers[i]!.id,
            createdById: base.admin.id,
            idempotencyKey: key(31 + i),
            cartId: cart.id,
            channel: 'WEB',
            currency: 'BOB',
            status: pending ? 'PENDING_PAYMENT' : 'CANCELLED',
            total,
            stockReserved: pending,
            expiresAt: new Date(Date.now() + (pending ? 15 : -15) * 60000),
            cancellationReason: pending ? null : 'USER_CANCELLED',
            items: {
              create: {
                ...item,
                quantity: 1,
                unitPrice: product.price,
                discount: product.price.minus(total),
                productName: product.name,
                sizeName: sizes[1]!.name,
                colorName: colors[(i + 6) % 2]!.name,
              },
            },
            payments: {
              create: {
                method: 'GATEWAY',
                type: 'ELECTRONIC',
                status: pending ? 'PENDING' : i === 1 ? 'VOIDED' : 'REFUNDED',
                amount: total,
                externalReference: pending
                  ? null
                  : 'DEMO:V1:PAYMENT:' + (31 + i),
                stripeRefundStatus: i === 2 ? 'succeeded' : null,
              },
            },
          },
        });
        const inventory = await getStock(branch.id, item);
        if (pending)
          await prisma.inventory.update({
            where: { id: inventory.id },
            data: { reservedQuantity: { increment: 1 } },
          });
        await prisma.inventoryMovement.create({
          data: {
            inventoryId: inventory.id,
            type: 'CHECKOUT_HOLD',
            quantity: 1,
            reference: 'SALE:' + sale.id,
          },
        });
        if (!pending)
          await prisma.inventoryMovement.create({
            data: {
              inventoryId: inventory.id,
              type: 'CHECKOUT_RELEASE',
              quantity: 1,
              reference: 'SALE:' + sale.id,
            },
          });
      }
      for (const branch of branches) {
        const inventory = await getStock(branch.id, variant(0));
        await prisma.inventoryMovement.create({
          data: {
            inventoryId: inventory.id,
            type: 'PENDING_ENTRY',
            status: 'PENDING',
            quantity: 20,
            scheduledAt: at(-3),
            reference: 'DEMO:V1:INCOMING',
          },
        });
      }
      return {
        created: true,
        referenceDate: date,
        branches: 3,
        products: 12,
        completedSales: 30,
        otherSales: 3,
        reservations: 7,
        notificationsAdded: await ensureDemoNotifications(prisma),
        employees: 6,
        customers: 4,
      };
    },
    { timeout: 120000, maxWait: 10000 },
  );
}
