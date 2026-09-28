import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { SupplierPageDto, SupplierProductDto } from './supplier-portal.dto.js';

const selection = {
  id: true,
  name: true,
  description: true,
  active: true,
  supplierAvailability: true,
  seasonId: true,
  collectionId: true,
  season: { select: { id: true, name: true, active: true } },
  collection: {
    select: { id: true, name: true, seasonId: true, active: true },
  },
  category: { select: { id: true, name: true } },
} satisfies Prisma.ProductSelect;

@Injectable()
export class SupplierPortalService {
  constructor(private readonly prisma: PrismaService) {}

  async supply(id: number) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { supplierAvailability: true },
    });
    if (!product) throw new NotFoundException('Producto no encontrado.');
    return product;
  }

  private ownership(userId: number): Prisma.ProductWhereInput {
    return {
      supplier: {
        active: true,
        accounts: {
          some: {
            id: userId,
            active: true,
            roles: { some: { role: { name: 'SUPPLIER' } } },
          },
        },
      },
    };
  }
  private async account(
    userId: number,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const user = await tx.user.findFirst({
      where: {
        id: userId,
        active: true,
        supplier: { active: true },
        roles: { some: { role: { name: 'SUPPLIER' } } },
      },
      select: { supplierId: true },
    });
    if (!user?.supplierId)
      throw new ForbiddenException(
        'Tu cuenta no tiene un proveedor activo asociado. Solicita la vinculacion al administrador.',
      );
    return user.supplierId;
  }
  async products(userId: number, query: SupplierPageDto) {
    await this.account(userId);
    const where: Prisma.ProductWhereInput = {
      ...this.ownership(userId),
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        select: selection,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { id: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);
    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
  async update(userId: number, id: number, dto: SupplierProductDto) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await this.account(userId, tx);
          const where = { id, ...this.ownership(userId) };
          if (!(await tx.product.findFirst({ where, select: { id: true } })))
            throw new NotFoundException(
              'El producto no pertenece a tu proveedor.',
            );
          if (dto.collectionId !== undefined) {
            const collection = await tx.collection.findFirst({
              where: {
                id: dto.collectionId,
                seasonId: dto.seasonId,
                active: true,
                season: { active: true },
              },
            });
            if (!collection)
              throw new BadRequestException(
                'Selecciona una coleccion activa de la temporada indicada.',
              );
          }
          const changed = await tx.product.updateMany({
            where,
            data: {
              name: dto.name,
              description: dto.description,
              supplierAvailability: dto.supplierAvailability.trim() || null,
              seasonId: dto.seasonId,
              collectionId: dto.collectionId,
            },
          });
          if (changed.count !== 1)
            throw new ConflictException(
              'La asignacion del producto cambio. Actualiza la lista.',
            );
          return tx.product.findUniqueOrThrow({
            where: { id },
            select: selection,
          });
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034'].includes(e.code)
      )
        throw new ConflictException(
          'Ya existe ese nombre o los datos cambiaron. Actualiza y vuelve a intentarlo.',
        );
      throw e;
    }
  }
  async deliveries(userId: number, query: SupplierPageDto) {
    await this.account(userId);
    const where: Prisma.InventoryMovementWhereInput = {
      type: 'PENDING_ENTRY',
      inventory: { product: this.ownership(userId) },
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.inventoryMovement.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ scheduledAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          quantity: true,
          status: true,
          reference: true,
          occurredAt: true,
          scheduledAt: true,
          inventory: {
            select: {
              product: { select: { id: true, name: true } },
              size: { select: { name: true } },
              color: { select: { name: true } },
              branch: { select: { name: true, city: true } },
            },
          },
        },
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);
    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
}
