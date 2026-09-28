import { hash } from 'bcrypt';
import {
  PrismaClient,
  RoleName,
  type Color,
  type Size,
} from '../../src/generated/prisma/client.js';

const fixtureVersion = 'MASSIVE:V1';
const fixturePassword = 'Password123';
const totalCustomers = 120;
const totalProducts = 80;
const totalSales = 400;

const branches = [
  ['La Paz', 'Sucursal Sopocachi'],
  ['El Alto', 'Sucursal Ceja'],
  ['Cochabamba', 'Sucursal Cala Cala'],
  ['Santa Cruz de la Sierra', 'Sucursal Equipetrol'],
  ['Sucre', 'Sucursal Centro'],
  ['Tarija', 'Sucursal Los Parrales'],
  ['Oruro', 'Sucursal Minera'],
  ['Potosi', 'Sucursal Colonial'],
] as const;

const categories = [
  'Camisas',
  'Poleras',
  'Pantalones',
  'Chaquetas',
  'Vestidos',
  'Faldas',
  'Blusas',
  'Shorts',
  'Buzos',
  'Accesorios',
] as const;
const productKinds = [
  'Camisa Urbana',
  'Polera Basica',
  'Pantalon Recto',
  'Chaqueta Ligera',
  'Vestido Casual',
  'Falda Midi',
  'Blusa Clasica',
  'Short Deportivo',
  'Buzo Comodo',
  'Bolso Diario',
] as const;
const firstNames = [
  'Ana',
  'Bruno',
  'Carla',
  'Daniel',
  'Elena',
  'Fabian',
  'Gabriela',
  'Hugo',
  'Ines',
  'Javier',
  'Karen',
  'Luis',
] as const;
const lastNames = [
  'Flores',
  'Rojas',
  'Vargas',
  'Mendez',
  'Quispe',
  'Soria',
  'Rivera',
  'Torres',
  'Luna',
  'Paredes',
] as const;

export interface MassiveSeedOptions {
  referenceDate?: string;
  saltRounds?: number;
}

const pad = (value: number, length = 3) => String(value).padStart(length, '0');
const massiveKey = (value: number) =>
  'fa000001-0000-4000-8000-' + String(value).padStart(12, '0');

function currentBoliviaDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .formatToParts(new Date())
    .reduce(
      (result, part) =>
        part.type === 'literal'
          ? result
          : { ...result, [part.type]: part.value },
      {} as Record<string, string>,
    );
}

function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

function priceFor(index: number) {
  return 75 + (index % 10) * 23 + Math.floor(index / 10) * 7;
}

export async function seedMassive(
  client: PrismaClient,
  options: MassiveSeedOptions = {},
) {
  const today = currentBoliviaDate();
  const date =
    options.referenceDate ?? `${today.year}-${today.month}-${today.day}`;
  if (!validDate(date))
    throw new Error('SEED_MASSIVE_DATE must be a real YYYY-MM-DD date');
  const rounds = options.saltRounds ?? 12;
  if (!Number.isInteger(rounds) || rounds < 10 || rounds > 14)
    throw new Error('PASSWORD_SALT_ROUNDS must be between 10 and 14');

  const passwordHash = await hash(fixturePassword, rounds);
  const at = (daysAgo: number, hour = 15) =>
    new Date(
      Date.parse(`${date}T${String(hour).padStart(2, '0')}:00:00Z`) -
        daysAgo * 86400000,
    );

  return client.$transaction(
    async (prisma) => {
      await prisma.$executeRaw`SELECT pg_advisory_xact_lock(731202)`;
      const marker = await prisma.user.findUnique({
        where: { email: 'admin@masivo.fashionstore.test' },
      });
      if (marker)
        return {
          created: false,
          referenceDate: date,
          approximateRecords: 3142,
        };
      if (
        await prisma.branch.count({
          where: { name: { startsWith: 'MASIVO - ' } },
        })
      )
        throw new Error(
          'Massive branches already exist without the complete fixture marker; use a fresh database or review existing data',
        );

      const roles = new Map<RoleName, number>();
      for (const name of Object.values(RoleName)) {
        const role = await prisma.role.upsert({
          where: { name },
          update: {},
          create: { name },
        });
        roles.set(name, role.id);
      }
      const roleId = (name: RoleName) => roles.get(name)!;

      const seasonRows = [];
      for (const [index, name] of [
        'Temporada 2026',
        'Temporada 2027',
      ].entries())
        seasonRows.push(
          await prisma.season.upsert({
            where: { name },
            update: {},
            create: {
              name,
              startDate: at(365 - index * 365),
              endDate: at(-365 + index * 365),
            },
          }),
        );
      const collectionRows = [];
      for (const [index, name] of [
        'Coleccion Urbana',
        'Coleccion Esencial',
        'Coleccion Andina',
        'Coleccion Verano',
      ].entries())
        collectionRows.push(
          await prisma.collection.upsert({
            where: {
              seasonId_name: {
                seasonId: seasonRows[index % seasonRows.length]!.id,
                name,
              },
            },
            update: {},
            create: {
              seasonId: seasonRows[index % seasonRows.length]!.id,
              name,
              description: 'Coleccion comercial para Bolivia',
            },
          }),
        );
      const categoryRows = [];
      for (const name of categories)
        categoryRows.push(
          await prisma.category.upsert({
            where: { name },
            update: {},
            create: { name, description: `Categoria ${name} para Bolivia` },
          }),
        );
      const sizeRows: Size[] = [];
      for (const name of ['XS', 'S', 'M', 'L', 'XL'])
        sizeRows.push(
          await prisma.size.upsert({
            where: { name },
            update: {},
            create: { name },
          }),
        );
      const colorRows: Color[] = [];
      for (const [name, hexCode] of [
        ['Negro', '#111111'],
        ['Blanco', '#FFFFFF'],
        ['Azul', '#2563EB'],
        ['Rojo', '#DC2626'],
        ['Verde', '#16A34A'],
        ['Beige', '#D6C3A5'],
      ])
        colorRows.push(
          await prisma.color.upsert({
            where: { name },
            update: {},
            create: { name, hexCode },
          }),
        );

      const suppliers = [];
      for (let index = 0; index < 6; index++) {
        const number = pad(index + 1, 2);
        const supplier = await prisma.supplier.create({
          data: {
            name: `MASIVO - Proveedor ${number}`,
            contact: `Contacto Proveedor ${number}`,
            phone: `+591 71${pad(index + 1, 6)}`,
            email: `proveedor${number}@masivo.fashionstore.test`,
          },
        });
        suppliers.push(supplier);
        await prisma.user.create({
          data: {
            name: `Proveedor ${number}`,
            email: `proveedor${number}@masivo.fashionstore.test`,
            passwordHash,
            supplierId: supplier.id,
            roles: { create: { roleId: roleId('SUPPLIER') } },
          },
        });
      }

      const branchRows = [];
      const cashiersByBranch = new Map<
        number,
        { id: number; userId: number }
      >();
      for (const [index, [city, label]] of branches.entries()) {
        const branch = await prisma.branch.create({
          data: {
            name: `MASIVO - ${label}`,
            city,
            address: `Av. Principal ${100 + index}, ${city}`,
            phone: `+591 72${pad(index + 1, 6)}`,
            warehouseName: `Almacen ${city}`,
            cashRegisters: { create: { name: 'Caja 1' } },
          },
        });
        branchRows.push(branch);
        await prisma.user.create({
          data: {
            name: `Encargado ${city}`,
            email: `encargado${pad(index + 1, 2)}@masivo.fashionstore.test`,
            passwordHash,
            roles: { create: { roleId: roleId('BRANCH_MANAGER') } },
            employee: {
              create: { branchId: branch.id, jobTitle: 'Encargado' },
            },
          },
        });
        const cashier = await prisma.user.create({
          data: {
            name: `Cajero ${city}`,
            email: `cajero${pad(index + 1, 2)}@masivo.fashionstore.test`,
            passwordHash,
            roles: { create: { roleId: roleId('CASHIER') } },
            employee: { create: { branchId: branch.id, jobTitle: 'Cajero' } },
          },
          include: { employee: true },
        });
        cashiersByBranch.set(branch.id, {
          id: cashier.employee!.id,
          userId: cashier.id,
        });
      }
      const admin = await prisma.user.create({
        data: {
          name: 'Administrador Masivo',
          email: 'admin@masivo.fashionstore.test',
          passwordHash,
          roles: { create: { roleId: roleId('ADMINISTRATOR') } },
        },
      });

      const customers = [];
      for (let index = 0; index < totalCustomers; index++) {
        const number = pad(index + 1);
        const city = branches[index % branches.length]![0];
        const user = await prisma.user.create({
          data: {
            name: `${firstNames[index % firstNames.length]} ${lastNames[index % lastNames.length]} ${number}`,
            email: `cliente${number}@masivo.fashionstore.test`,
            passwordHash,
            roles: { create: { roleId: roleId('CUSTOMER') } },
            client: {
              create: {
                phone: `+591 73${pad(index + 1, 6)}`,
                address: `Calle ${20 + index}, ${city}`,
                wholesale: index % 12 === 0,
              },
            },
          },
          include: { client: true },
        });
        customers.push(user.client!);
      }

      const products = [];
      for (let index = 0; index < totalProducts; index++) {
        const price = priceFor(index);
        const discountPercent = index % 5 === 0 ? 10 : 0;
        const product = await prisma.product.create({
          data: {
            name: `MASIVO - ${productKinds[index % productKinds.length]} ${pad(index + 1)}`,
            description: `Prenda comercial ficticia ${pad(index + 1)} para venta en Bolivia`,
            price,
            wholesalePrice: Number((price * 0.78).toFixed(2)),
            discountPercent,
            promotionStart: discountPercent ? at(90) : null,
            promotionEnd: discountPercent ? at(-90) : null,
            imageUrl: `https://placehold.co/800x1000?text=Producto+${pad(index + 1)}`,
            imageUrls: [
              `https://placehold.co/800x1000?text=Producto+${pad(index + 1)}`,
              `https://placehold.co/800x1000?text=Detalle+${pad(index + 1)}`,
            ],
            supplierAvailability: 'Disponible para reposicion nacional',
            categoryId: categoryRows[index % categoryRows.length]!.id,
            seasonId: seasonRows[index % seasonRows.length]!.id,
            collectionId: collectionRows[index % collectionRows.length]!.id,
            supplierId: suppliers[index % suppliers.length]!.id,
            sizes: {
              create: [0, 1, 2].map((offset) => ({
                sizeId: sizeRows[(index + offset) % sizeRows.length]!.id,
              })),
            },
            colors: {
              create: [0, 1].map((offset) => ({
                colorId: colorRows[(index + offset) % colorRows.length]!.id,
              })),
            },
          },
        });
        products.push(product);
      }

      const inventoryRows: Array<{
        id: number;
        branchId: number;
        productId: number;
        sizeId: number;
        colorId: number;
      }> = [];
      for (let index = 0; index < totalProducts * 2; index++) {
        const productIndex = index % totalProducts;
        const product = products[productIndex]!;
        const branch =
          branchRows[
            (productIndex + Math.floor(index / totalProducts) * 3) %
              branchRows.length
          ]!;
        const inventory = await prisma.inventory.create({
          data: {
            branchId: branch.id,
            productId: product.id,
            sizeId: sizeRows[productIndex % sizeRows.length]!.id,
            colorId: colorRows[productIndex % colorRows.length]!.id,
            physicalQuantity: 80,
            movements: {
              create: {
                type: 'ENTRY',
                quantity: 80,
                occurredAt: at(100),
                reference: `${fixtureVersion}:OPENING:${pad(index + 1)}`,
                observation: 'Existencia inicial masiva',
              },
            },
          },
        });
        inventoryRows.push({
          id: inventory.id,
          branchId: branch.id,
          productId: product.id,
          sizeId: sizeRows[productIndex % sizeRows.length]!.id,
          colorId: colorRows[productIndex % colorRows.length]!.id,
        });
      }

      for (let index = 0; index < totalSales; index++) {
        const inventory = inventoryRows[index % inventoryRows.length]!;
        const productIndex = index % totalProducts;
        const product = products[productIndex]!;
        const customer = customers[index % customers.length]!;
        const channel =
          index % 3 === 0 ? 'IN_STORE' : index % 3 === 1 ? 'WEB' : 'MOBILE';
        const status =
          index < 320
            ? 'COMPLETED'
            : index < 360
              ? 'PENDING_PAYMENT'
              : 'CANCELLED';
        const wholesale = index % 12 === 0;
        const listedPrice = priceFor(productIndex);
        const retailPrice =
          productIndex % 5 === 0
            ? Number((listedPrice * 0.9).toFixed(2))
            : listedPrice;
        const unitPrice = wholesale
          ? Number((listedPrice * 0.78).toFixed(2))
          : retailPrice;
        const discount = Number((listedPrice - unitPrice).toFixed(2));
        const soldAt = at(1 + (index % 90), 9 + (index % 9));
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
                      productId: inventory.productId,
                      sizeId: inventory.sizeId,
                      colorId: inventory.colorId,
                      quantity: 1,
                      unitPrice,
                    },
                  },
                },
              });
        const cashier = cashiersByBranch.get(inventory.branchId)!;
        const paymentStatus =
          status === 'COMPLETED'
            ? 'APPROVED'
            : status === 'PENDING_PAYMENT'
              ? 'PENDING'
              : 'VOIDED';
        const sale = await prisma.sale.create({
          data: {
            branchId: inventory.branchId,
            clientId: customer.id,
            employeeId: channel === 'IN_STORE' ? cashier.id : null,
            cartId: cart?.id,
            createdById: admin.id,
            idempotencyKey: massiveKey(index + 1),
            channel,
            status,
            currency: 'BOB',
            total: unitPrice,
            soldAt,
            confirmedAt: status === 'COMPLETED' ? soldAt : null,
            stockReserved: status === 'PENDING_PAYMENT',
            expiresAt: status === 'PENDING_PAYMENT' ? at(-2) : null,
            cancellationReason:
              status === 'CANCELLED' ? 'USER_CANCELLED' : null,
            items: {
              create: {
                productId: inventory.productId,
                sizeId: inventory.sizeId,
                colorId: inventory.colorId,
                quantity: 1,
                unitPrice: listedPrice,
                discount,
                productName: product.name,
                sizeName: sizeRows[productIndex % sizeRows.length]!.name,
                colorName: colorRows[productIndex % colorRows.length]!.name,
              },
            },
            payments: {
              create: {
                method:
                  channel === 'IN_STORE'
                    ? index % 4 === 0
                      ? 'CASH'
                      : index % 4 === 1
                        ? 'CARD'
                        : index % 4 === 2
                          ? 'QR'
                          : 'BANK_TRANSFER'
                    : 'GATEWAY',
                type: channel === 'IN_STORE' ? 'IN_STORE' : 'ELECTRONIC',
                status: paymentStatus,
                amount: unitPrice,
                paidAt: soldAt,
                externalReference: `${fixtureVersion}:PAYMENT:${pad(index + 1)}`,
              },
            },
          },
        });
        if (status === 'COMPLETED')
          await prisma.inventory.update({
            where: { id: inventory.id },
            data: { physicalQuantity: { decrement: 1 } },
          });
        if (status === 'PENDING_PAYMENT')
          await prisma.inventory.update({
            where: { id: inventory.id },
            data: { reservedQuantity: { increment: 1 } },
          });
        await prisma.inventoryMovement.create({
          data: {
            inventoryId: inventory.id,
            employeeId: channel === 'IN_STORE' ? cashier.id : null,
            type:
              status === 'COMPLETED'
                ? 'SALE'
                : status === 'PENDING_PAYMENT'
                  ? 'CHECKOUT_HOLD'
                  : 'CHECKOUT_RELEASE',
            quantity: 1,
            occurredAt: soldAt,
            reference: `SALE:${sale.id}`,
            observation: 'Operacion creada por el seed masivo',
          },
        });
      }

      return {
        created: true,
        referenceDate: date,
        password: fixturePassword,
        approximateRecords: 3142,
        branches: branchRows.length,
        products: totalProducts,
        customers: totalCustomers,
        sales: totalSales,
        completedSales: 320,
        pendingOrders: 40,
        cancelledOrders: 40,
      };
    },
    { timeout: 120000, maxWait: 10000 },
  );
}
