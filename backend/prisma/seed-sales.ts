import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/database/prisma/prisma.service.js';
import { Role } from '../src/common/enums/role.enum.js';
import { productPrice } from '../src/common/utils/product-price.js';
import { SalesRepository } from '../src/modules/sales/sales.repository.js';
import { SalesService } from '../src/modules/sales/sales.service.js';

const config = new ConfigService({
  database: { url: process.env.DATABASE_URL },
  SALES_CURRENCY: process.env.SALES_CURRENCY ?? 'BOB',
});
const prisma = new PrismaService(config);
const idempotencyKey = '8c219482-dc95-4b6b-87a1-1bd8433a6872';

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email)
    throw new Error('Set SEED_ADMIN_EMAIL and run the base seed first');
  const user = await prisma.user.findUnique({
    where: { email },
    include: { roles: { include: { role: true } } },
  });
  if (
    !user?.active ||
    !user.roles.some(({ role }) => role.name === 'ADMINISTRATOR')
  )
    throw new Error('An active seeded administrator is required');
  const existing = await prisma.sale.findUnique({
    where: {
      createdById_idempotencyKey: { createdById: user.id, idempotencyKey },
    },
  });
  if (existing) {
    console.log(
      `Demo sale already exists: ${existing.id} (${existing.status})`,
    );
    return;
  }
  const inventory = await prisma.inventory.findFirst({
    where: {
      branch: { active: true },
      product: { active: true },
      physicalQuantity: { gt: prisma.inventory.fields.reservedQuantity },
    },
    include: { product: true },
    orderBy: { id: 'asc' },
  });
  if (!inventory)
    throw new Error('Register available inventory or run the base seed first');
  const service = new SalesService(new SalesRepository(prisma), config);
  const sale = await service.createInStore(
    {
      idempotencyKey,
      branchId: inventory.branchId,
      items: [
        {
          productId: inventory.productId,
          sizeId: inventory.sizeId,
          colorId: inventory.colorId,
          quantity: 1,
        },
      ],
      expectedTotal: productPrice(inventory.product).currentPrice.toNumber(),
      paymentMethod: 'CASH',
    },
    { id: user.id, email: user.email, roles: [Role.ADMINISTRATOR] },
  );
  console.log(
    `Demo sale ${sale.id}: ${sale.status}, total ${sale.total} ${sale.currency}; one physical unit consumed`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Sales seed failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
