import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { hash } from 'bcrypt';
import { PrismaService } from '../src/database/prisma/prisma.service.js';
import { Role } from '../src/common/enums/role.enum.js';
import { ReservationsRepository } from '../src/modules/reservations/reservations.repository.js';
import { ReservationsService } from '../src/modules/reservations/reservations.service.js';

// Opt-in fixture using the same transaction and stock rules as the API.
const config = new ConfigService({
  database: { url: process.env.DATABASE_URL },
  RESERVATION_TIME_ZONE: process.env.RESERVATION_TIME_ZONE ?? 'America/La_Paz',
});
const prisma = new PrismaService(config);

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
      'Set SEED_CUSTOMER_EMAIL and SEED_CUSTOMER_PASSWORD (8–72 bytes) before seeding reservations',
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
        client: { create: { phone: '70000001' } },
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
  const observation = 'Reserva de demostración (seed-reservations)';
  const existing = await prisma.reservation.findFirst({
    where: { clientId: user.client.id, observation },
  });
  if (existing) {
    console.log(
      `Demo reservation already exists: ${existing.id} (${existing.status})`,
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
  const service = new ReservationsService(
    new ReservationsRepository(prisma),
    config,
  );
  const reservation = await service.create(
    {
      branchId: inventory.branchId,
      approximateTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      observation,
      items: [
        {
          productId: inventory.productId,
          sizeId: inventory.sizeId,
          colorId: inventory.colorId,
          quantity: 1,
        },
      ],
    },
    { id: user.id, email: user.email, roles: [Role.CUSTOMER] },
  );
  console.log(
    `Demo reservation created: ${reservation.id}; one unit reserved; expires ${reservation.expiresAt.toISOString()}`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : 'Reservation seed failed',
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
