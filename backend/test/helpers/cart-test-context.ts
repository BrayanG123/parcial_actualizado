import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import { hash } from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/database/prisma/prisma.service.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { ReservationExpirationService } from '../../src/modules/reservations/reservation-expiration.service.js';
import { CheckoutExpirationService } from '../../src/modules/sales/checkout-expiration.service.js';
import { PaymentGatewayService } from '../../src/modules/payments/payment-gateway.service.js';
import { PaymentReconciliationService } from '../../src/modules/payments/payment-reconciliation.service.js';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter.js';
import { ResponseInterceptor } from '../../src/common/interceptors/response.interceptor.js';

export async function cartTestContext(
  databaseUrl: string,
  paymentGateway?: PaymentGatewayService,
  /** Permite reemplazar proveedores externos, por ejemplo el de IA. */
  configure?: (builder: TestingModuleBuilder) => void,
) {
  const schema = `cart_test_${randomUUID().replaceAll('-', '')}`;
  const sql = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
  });
  let prisma: PrismaClient | undefined;
  let app: INestApplication | undefined;
  let connected = false;
  const close = async () => {
    await app?.close();
    await prisma?.$disconnect();
    if (connected) {
      if (!/^cart_test_[a-f0-9]{32}$/.test(schema))
        throw new Error('Unexpected schema name');
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
  };
  try {
    await sql.connect();
    connected = true;
    await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`SET search_path TO "${schema}"`);
    const migrations = new URL('../../prisma/migrations/', import.meta.url);
    for (const directory of (await readdir(migrations, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const migration = await readFile(
        new URL(`${directory.name}/migration.sql`, migrations),
        'utf8',
      );
      await sql.query(
        migration.replace('CREATE SCHEMA IF NOT EXISTS "public";', ''),
      );
    }
    prisma = new PrismaClient({
      adapter: new PrismaPg(
        {
          connectionString: databaseUrl,
          options: `-c search_path=${schema} -c timezone=UTC`,
        },
        { schema },
      ),
    });
    const branch = await prisma.branch.create({
      data: {
        name: 'Central',
        city: 'La Paz',
        address: 'Test',
        cashRegisters: { create: { name: 'Caja 1' } },
      },
    });
    const otherBranch = await prisma.branch.create({
      data: {
        name: 'Norte',
        city: 'La Paz',
        address: 'Test',
        cashRegisters: { create: { name: 'Caja 1' } },
      },
    });
    const size = await prisma.size.create({ data: { name: 'M' } });
    const otherSize = await prisma.size.create({ data: { name: 'L' } });
    const color = await prisma.color.create({
      data: { name: 'Azul', hexCode: '#0000FF' },
    });
    const season = await prisma.season.create({
      data: {
        name: 'Test',
        startDate: new Date('2020-01-01'),
        endDate: new Date('2099-12-31'),
      },
    });
    const product = await prisma.product.create({
      data: {
        name: 'Camisa',
        price: '19.99',
        category: { create: { name: 'Camisas' } },
        season: { connect: { id: season.id } },
        collection: { create: { name: 'Test', seasonId: season.id } },
        supplier: { create: { name: 'Proveedor' } },
        sizes: { create: [{ sizeId: size.id }, { sizeId: otherSize.id }] },
        colors: { create: { colorId: color.id } },
      },
    });
    await prisma.inventory.createMany({
      data: [branch, otherBranch].flatMap((store) =>
        [size, otherSize].map((variantSize) => ({
          branchId: store.id,
          productId: product.id,
          sizeId: variantSize.id,
          colorId: color.id,
          physicalQuantity: 10,
        })),
      ),
    });
    const password = 'CartTestPassword123!';
    const passwordHash = await hash(password, 10);
    const customerRole = await prisma.role.create({
      data: { name: 'CUSTOMER' },
    });
    const adminRole = await prisma.role.create({
      data: { name: 'ADMINISTRATOR' },
    });
    const users = [];
    for (const [email, isCustomer] of [
      ['customer@cart.test', true],
      ['other@cart.test', true],
      ['admin@cart.test', false],
    ] as const) {
      users.push(
        await prisma.user.create({
          data: {
            name: email,
            email,
            passwordHash,
            client: isCustomer ? { create: {} } : undefined,
            roles: {
              create: { roleId: isCustomer ? customerRole.id : adminRole.id },
            },
          },
          include: { client: true },
        }),
      );
    }
    const builder = Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(ReservationExpirationService)
      .useValue({})
      .overrideProvider(CheckoutExpirationService)
      .useValue({})
      .overrideProvider(PaymentReconciliationService)
      .useValue({});
    if (paymentGateway)
      builder.overrideProvider(PaymentGatewayService).useValue(paymentGateway);
    configure?.(builder);
    const module = await builder.compile();
    app = module.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
    const tokens: string[] = [];
    for (const user of users) {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user.email, password })
        .expect(201);
      tokens.push(response.body.data.accessToken as string);
    }
    return {
      schema,
      app,
      prisma,
      branch,
      otherBranch,
      product,
      size,
      otherSize,
      color,
      users,
      tokens,
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
