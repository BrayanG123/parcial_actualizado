import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service.js';

const historyVariant = {
  productId: true,
  size: { select: { id: true, name: true } },
  color: { select: { id: true, name: true } },
  product: {
    select: {
      name: true,
      categoryId: true,
      seasonId: true,
      category: { select: { name: true } },
    },
  },
} as const;

@Injectable()
export class AiRepository {
  constructor(private readonly prisma: PrismaService) {}

  client(userId: number) {
    return this.prisma.client.findFirst({
      where: { userId, user: { active: true } },
      select: { id: true },
    });
  }

  employee(userId: number) {
    return this.prisma.employee.findUnique({
      where: { userId },
      select: { active: true, branchId: true },
    });
  }

  branches(branchId?: number) {
    return this.prisma.branch.findMany({
      where: { active: true, ...(branchId ? { id: branchId } : {}) },
      select: { id: true, name: true, city: true },
      orderBy: { id: 'asc' },
    });
  }

  /** Catalogo activo con existencias de sucursales activas; acotado para la demo. */
  catalog() {
    return this.prisma.product.findMany({
      where: { active: true },
      take: 300,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        discountPercent: true,
        promotionStart: true,
        promotionEnd: true,
        categoryId: true,
        seasonId: true,
        collectionId: true,
        category: { select: { name: true } },
        season: {
          select: { name: true, active: true, startDate: true, endDate: true },
        },
        collection: { select: { name: true } },
        inventory: {
          where: { branch: { active: true } },
          select: {
            physicalQuantity: true,
            reservedQuantity: true,
            branch: { select: { name: true, city: true } },
            size: { select: { id: true, name: true } },
            color: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  async history(clientId: number) {
    const [sales, reservations, cart] = await Promise.all([
      this.prisma.saleItem.findMany({
        where: { sale: { clientId, status: 'COMPLETED' } },
        select: historyVariant,
        orderBy: { id: 'desc' },
        take: 50,
      }),
      this.prisma.reservationItem.findMany({
        where: { reservation: { clientId } },
        select: historyVariant,
        orderBy: { id: 'desc' },
        take: 50,
      }),
      this.prisma.cartItem.findMany({
        where: { cart: { clientId, status: 'ACTIVE' } },
        select: historyVariant,
        take: 50,
      }),
    ]);
    return { sales, reservations, cart };
  }

  popularity(since: Date) {
    return this.prisma.saleItem.groupBy({
      by: ['productId'],
      where: { sale: { status: 'COMPLETED', soldAt: { gte: since } } },
      _sum: { quantity: true },
    });
  }

  saveRecommendations(
    clientId: number,
    items: Array<{ productId: number; reason: string; score: number }>,
    source: string,
  ) {
    return this.prisma.$transaction(
      items.map((item) =>
        this.prisma.aiRecommendation.create({
          data: {
            clientId,
            productId: item.productId,
            reason: item.reason.slice(0, 500),
            score: item.score,
            source: source.slice(0, 100),
          },
          select: { id: true, createdAt: true },
        }),
      ),
    );
  }
}

export type CatalogRow = Awaited<ReturnType<AiRepository['catalog']>>[number];
export type ClientHistory = Awaited<ReturnType<AiRepository['history']>>;
