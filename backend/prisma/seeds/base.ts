import { hash } from 'bcrypt';
import { PrismaClient, RoleName } from '../../src/generated/prisma/client.js';

export interface SeedOptions {
  adminEmail: string;
  adminPassword: string;
  saltRounds?: number;
}
export function validateSeedPassword(password: string, label: string) {
  if (!password || password.length < 8 || Buffer.byteLength(password) > 72)
    throw new Error(
      label + ' must contain at least 8 characters and at most 72 UTF-8 bytes',
    );
}
export async function seedBase(client: PrismaClient, options: SeedOptions) {
  const email = options.adminEmail?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error('Set a valid SEED_ADMIN_EMAIL');
  validateSeedPassword(options.adminPassword, 'SEED_ADMIN_PASSWORD');
  const rounds = options.saltRounds ?? 12;
  if (!Number.isInteger(rounds) || rounds < 10 || rounds > 14)
    throw new Error('PASSWORD_SALT_ROUNDS must be between 10 and 14');
  const passwordHash = await hash(options.adminPassword, rounds);
  return client.$transaction(
    async (prisma) => {
      await prisma.$executeRaw`SELECT pg_advisory_xact_lock(731200)`;
      const roles = await Promise.all(
        Object.values(RoleName).map((name) =>
          prisma.role.upsert({ where: { name }, update: {}, create: { name } }),
        ),
      );
      const existing = await prisma.user.findUnique({
        where: { email },
        include: { roles: { include: { role: true } } },
      });
      if (
        existing &&
        !existing.roles.some(({ role }) => role.name === 'ADMINISTRATOR')
      )
        throw new Error(
          'SEED_ADMIN_EMAIL already belongs to a non-administrator; choose another email',
        );
      const admin =
        existing ??
        (await prisma.user.create({
          data: {
            name: 'Administrador FashionStore',
            email,
            passwordHash,
            roles: {
              create: {
                roleId: roles.find((role) => role.name === 'ADMINISTRATOR')!.id,
              },
            },
          },
        }));
      const branch = await prisma.branch.upsert({
        where: {
          city_name: {
            city: 'Santa Cruz de la Sierra',
            name: 'Sucursal Central',
          },
        },
        update: {},
        create: {
          name: 'Sucursal Central',
          city: 'Santa Cruz de la Sierra',
          address: 'Av. Principal #100',
          phone: '+591 70000000',
        },
      });
      const category = await prisma.category.upsert({
        where: { name: 'Camisas' },
        update: {},
        create: { name: 'Camisas', description: 'Camisas casuales y formales' },
      });
      const season = await prisma.season.upsert({
        where: { name: 'Primavera-Verano 2026' },
        update: {},
        create: {
          name: 'Primavera-Verano 2026',
          startDate: new Date('2026-09-01'),
          endDate: new Date('2027-02-28'),
        },
      });
      const collection = await prisma.collection.upsert({
        where: {
          seasonId_name: { seasonId: season.id, name: 'Esencial 2026' },
        },
        update: {},
        create: {
          seasonId: season.id,
          name: 'Esencial 2026',
          description: 'Colección base del MVP',
        },
      });
      const supplier = await prisma.supplier.upsert({
        where: { name: 'Textiles Andinos' },
        update: {},
        create: {
          name: 'Textiles Andinos',
          email: 'ventas@textiles-andinos.test',
        },
      });
      const sizes = await Promise.all(
        ['M', 'L'].map((name) =>
          prisma.size.upsert({ where: { name }, update: {}, create: { name } }),
        ),
      );
      const color = await prisma.color.upsert({
        where: { name: 'Azul' },
        update: {},
        create: { name: 'Azul', hexCode: '#2563EB' },
      });
      const product = await prisma.product.upsert({
        where: {
          supplierId_name: { supplierId: supplier.id, name: 'Camisa Oxford' },
        },
        update: {},
        create: {
          name: 'Camisa Oxford',
          description: 'Prenda de demostración del MVP',
          price: '249.90',
          imageUrl: 'https://placehold.co/800x1000?text=Camisa+Oxford',
          categoryId: category.id,
          seasonId: season.id,
          collectionId: collection.id,
          supplierId: supplier.id,
        },
      });
      await prisma.productSize.createMany({
        data: sizes.map((size) => ({ productId: product.id, sizeId: size.id })),
        skipDuplicates: true,
      });
      await prisma.productColor.createMany({
        data: [{ productId: product.id, colorId: color.id }],
        skipDuplicates: true,
      });
      for (const size of sizes) {
        const key = {
          branchId: branch.id,
          productId: product.id,
          sizeId: size.id,
          colorId: color.id,
        };
        const current = await prisma.inventory.findUnique({
          where: { branchId_productId_sizeId_colorId: key },
        });
        if (!current)
          await prisma.inventory.create({
            data: {
              ...key,
              physicalQuantity: 10,
              movements: {
                create: {
                  type: 'ENTRY',
                  quantity: 10,
                  reference: 'SEED:BASE:OPENING',
                  observation: 'Existencias iniciales del seed base',
                },
              },
            },
          });
      }
      return { admin, roles, branch };
    },
    { timeout: 60000, maxWait: 10000 },
  );
}
