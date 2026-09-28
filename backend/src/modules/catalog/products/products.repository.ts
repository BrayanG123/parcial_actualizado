import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../database/prisma/prisma.service.js';
import { ListProductsQueryDto } from './dto/list-products-query.dto.js';

const productSelect = {
  id: true,
  name: true,
  description: true,
  price: true,
  wholesalePrice: true,
  imageUrls: true,
  imageUrl: true,
  discountPercent: true,
  promotionStart: true,
  promotionEnd: true,
  active: true,
  createdAt: true,
  updatedAt: true,
  categoryId: true,
  seasonId: true,
  collectionId: true,
  supplierId: true,
  category: true,
  season: true,
  collection: true,
  supplier: { select: { id: true, name: true } },
  sizes: { select: { size: true } },
  colors: { select: { color: true } },
  arResources: { where: { active: true } },
} satisfies Prisma.ProductSelect;

export interface ProductWriteData {
  supplierAvailability?: string | null;
  name?: string;
  description?: string;
  price?: number;
  wholesalePrice?: number | null;
  imageUrls?: string[];
  imageUrl?: string | null;
  discountPercent?: number;
  promotionStart?: Date | null;
  promotionEnd?: Date | null;
  active?: boolean;
  categoryId?: number;
  seasonId?: number;
  collectionId?: number;
  supplierId?: number;
}

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: number) {
    return this.prisma.product.findUnique({
      where: { id },
      select: productSelect,
    });
  }

  findBySupplierAndName(supplierId: number, name: string) {
    return this.prisma.product.findUnique({
      where: { supplierId_name: { supplierId, name } },
      select: { id: true },
    });
  }

  getDependencies(
    categoryId: number,
    seasonId: number,
    collectionId: number,
    supplierId: number,
    sizeIds: number[],
    colorIds: number[],
  ) {
    return Promise.all([
      this.prisma.category.count({ where: { id: categoryId } }),
      this.prisma.season.count({ where: { id: seasonId, active: true } }),
      this.prisma.collection.findUnique({
        where: { id: collectionId },
        select: { seasonId: true, active: true },
      }),
      this.prisma.supplier.count({ where: { id: supplierId, active: true } }),
      this.prisma.size.count({ where: { id: { in: sizeIds } } }),
      this.prisma.color.count({ where: { id: { in: colorIds } } }),
    ]);
  }

  countInventoryOutsideVariants(
    productId: number,
    sizeIds: number[],
    colorIds: number[],
  ) {
    return this.prisma.inventory.count({
      where: {
        productId,
        OR: [{ sizeId: { notIn: sizeIds } }, { colorId: { notIn: colorIds } }],
      },
    });
  }

  async findAll(query: ListProductsQueryDto) {
    const where: Prisma.ProductWhereInput = {
      active: query.active ?? true,
      categoryId: query.categoryId,
      seasonId: query.seasonId,
      collectionId: query.collectionId,
      supplierId: query.supplierId,
      price:
        query.minPrice !== undefined || query.maxPrice !== undefined
          ? { gte: query.minPrice, lte: query.maxPrice }
          : undefined,
      ...(query.search
        ? {
            OR: [
              {
                name: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                description: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
      ...(query.sizeId ? { sizes: { some: { sizeId: query.sizeId } } } : {}),
      ...(query.colorId
        ? { colors: { some: { colorId: query.colorId } } }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        select: productSelect,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.product.count({ where }),
    ]);

    return { data, total };
  }

  create(
    data: Required<
      Pick<
        ProductWriteData,
        | 'name'
        | 'price'
        | 'discountPercent'
        | 'categoryId'
        | 'seasonId'
        | 'collectionId'
        | 'supplierId'
      >
    > &
      ProductWriteData,
    sizeIds: number[],
    colorIds: number[],
  ) {
    return this.prisma.product.create({
      data: {
        ...data,
        sizes: { create: sizeIds.map((sizeId) => ({ sizeId })) },
        colors: { create: colorIds.map((colorId) => ({ colorId })) },
      },
      select: productSelect,
    });
  }

  update(
    id: number,
    data: ProductWriteData,
    sizeIds?: number[],
    colorIds?: number[],
  ) {
    return this.prisma.$transaction(async (transaction) => {
      if (sizeIds) {
        await transaction.productSize.deleteMany({ where: { productId: id } });
        await transaction.productSize.createMany({
          data: sizeIds.map((sizeId) => ({ productId: id, sizeId })),
        });
      }
      if (colorIds) {
        await transaction.productColor.deleteMany({ where: { productId: id } });
        await transaction.productColor.createMany({
          data: colorIds.map((colorId) => ({ productId: id, colorId })),
        });
      }

      return transaction.product.update({
        where: { id },
        data,
        select: productSelect,
      });
    });
  }

  deactivate(id: number) {
    return this.prisma.product.update({
      where: { id },
      data: { active: false },
      select: productSelect,
    });
  }
}
