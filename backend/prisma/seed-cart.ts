import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { hash } from 'bcrypt';
import { PrismaService } from '../src/database/prisma/prisma.service.js';
import { Role } from '../src/common/enums/role.enum.js';
import { CartRepository } from '../src/modules/cart/cart.repository.js';
import { CartService } from '../src/modules/cart/cart.service.js';

const prisma = new PrismaService(
  new ConfigService({ database: { url: process.env.DATABASE_URL } }),
);

async function main() {
  const email = process.env.SEED_CUSTOMER_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_CUSTOMER_PASSWORD;
  if (
    !email ||
    !password ||
    password.length < 8 ||
    Buffer.byteLength(password) > 72
  ) {
    throw new Error(
      'Set SEED_CUSTOMER_EMAIL and SEED_CUSTOMER_PASSWORD (8–72 bytes) before seeding the cart',
    );
  }
  const role = await prisma.role.findUniqueOrThrow({
    where: { name: 'CUSTOMER' },
  });
  let user = await prisma.user.findUnique({
    where: { email },
    include: { client: true, roles: { include: { role: true } } },
  });
  if (!user) {
    user = await prisma.user.create({
      data: {
        name: 'Cliente de demostración',
        email,
        passwordHash: await hash(password, 12),
        client: { create: {} },
        roles: { create: { roleId: role.id } },
      },
      include: { client: true, roles: { include: { role: true } } },
    });
  }
  if (
    !user.active ||
    !user.client ||
    !user.roles.some(({ role }) => role.name === 'CUSTOMER')
  ) {
    throw new Error(
      'The seed email belongs to an account without an active customer profile',
    );
  }
  const service = new CartService(new CartRepository(prisma));
  const actor = { id: user.id, email: user.email, roles: [Role.CUSTOMER] };
  const cart = await service.getActive(actor);
  if (cart.items.length) {
    console.log(
      `Active cart ${cart.id} already contains items; left unchanged`,
    );
    return;
  }
  const inventory = await prisma.inventory.findFirst({
    where: {
      branch: { active: true },
      product: { active: true },
      physicalQuantity: { gt: prisma.inventory.fields.reservedQuantity },
    },
    orderBy: { id: 'asc' },
  });
  if (!inventory)
    throw new Error('Run the base seed or register available inventory first');
  const result = await service.addItem(
    {
      productId: inventory.productId,
      sizeId: inventory.sizeId,
      colorId: inventory.colorId,
      quantity: 1,
    },
    actor,
  );
  console.log(
    `Demo cart ${result.id}: ${result.totalQuantity} unit, total ${result.total}; inventory unchanged`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Cart seed failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
