import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma/prisma.service.js';

@Injectable()
export class CatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCategories() {
    return this.prisma.category.findMany({
      include: { _count: { select: { products: true } } },
      orderBy: { name: 'asc' },
    });
  }

  findCategory(id: number) {
    return this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
  }

  findCategoryByName(name: string) {
    return this.prisma.category.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
  }

  createCategory(data: Prisma.CategoryCreateInput) {
    return this.prisma.category.create({ data });
  }

  updateCategory(id: number, data: Prisma.CategoryUpdateInput) {
    return this.prisma.category.update({ where: { id }, data });
  }

  deleteCategory(id: number) {
    return this.prisma.category.delete({ where: { id } });
  }

  findSizes() {
    return this.prisma.size.findMany({
      include: {
        _count: {
          select: {
            products: true,
            inventory: true,
            reservationItems: true,
            cartItems: true,
            saleItems: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  findSize(id: number) {
    return this.prisma.size.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            products: true,
            inventory: true,
            reservationItems: true,
            cartItems: true,
            saleItems: true,
          },
        },
      },
    });
  }

  findSizeByName(name: string) {
    return this.prisma.size.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
  }

  createSize(data: Prisma.SizeCreateInput) {
    return this.prisma.size.create({ data });
  }

  updateSize(id: number, data: Prisma.SizeUpdateInput) {
    return this.prisma.size.update({ where: { id }, data });
  }

  deleteSize(id: number) {
    return this.prisma.size.delete({ where: { id } });
  }

  findColors() {
    return this.prisma.color.findMany({
      include: {
        _count: {
          select: {
            products: true,
            inventory: true,
            reservationItems: true,
            cartItems: true,
            saleItems: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  findColor(id: number) {
    return this.prisma.color.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            products: true,
            inventory: true,
            reservationItems: true,
            cartItems: true,
            saleItems: true,
          },
        },
      },
    });
  }

  findColorByNameOrHex(name: string, hexCode: string) {
    return this.prisma.color.findFirst({
      where: {
        OR: [
          { name: { equals: name, mode: 'insensitive' } },
          { hexCode: { equals: hexCode, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    });
  }

  createColor(data: Prisma.ColorCreateInput) {
    return this.prisma.color.create({ data });
  }

  updateColor(id: number, data: Prisma.ColorUpdateInput) {
    return this.prisma.color.update({ where: { id }, data });
  }

  deleteColor(id: number) {
    return this.prisma.color.delete({ where: { id } });
  }

  findSeasons() {
    return this.prisma.season.findMany({
      include: {
        _count: { select: { collections: true, products: true } },
      },
      orderBy: { startDate: 'desc' },
    });
  }

  findSeason(id: number) {
    return this.prisma.season.findUnique({
      where: { id },
      include: {
        _count: { select: { collections: true, products: true } },
      },
    });
  }

  findSeasonByName(name: string) {
    return this.prisma.season.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
  }

  createSeason(data: Prisma.SeasonCreateInput) {
    return this.prisma.season.create({ data });
  }

  updateSeason(id: number, data: Prisma.SeasonUpdateInput) {
    return this.prisma.season.update({ where: { id }, data });
  }

  findCollections() {
    return this.prisma.collection.findMany({
      include: {
        season: true,
        _count: { select: { products: true } },
      },
      orderBy: [{ season: { startDate: 'desc' } }, { name: 'asc' }],
    });
  }

  findCollection(id: number) {
    return this.prisma.collection.findUnique({
      where: { id },
      include: {
        season: true,
        _count: { select: { products: true } },
      },
    });
  }

  findCollectionBySeasonAndName(seasonId: number, name: string) {
    return this.prisma.collection.findFirst({
      where: {
        seasonId,
        name: { equals: name, mode: 'insensitive' },
      },
      select: { id: true },
    });
  }

  createCollection(data: Prisma.CollectionUncheckedCreateInput) {
    return this.prisma.collection.create({ data });
  }

  updateCollection(id: number, data: Prisma.CollectionUncheckedUpdateInput) {
    return this.prisma.collection.update({ where: { id }, data });
  }

  findSuppliers() {
    return this.prisma.supplier.findMany({
      include: { _count: { select: { products: true } } },
      orderBy: { name: 'asc' },
    });
  }

  findSupplier(id: number) {
    return this.prisma.supplier.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
  }

  findSupplierByName(name: string) {
    return this.prisma.supplier.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
  }

  createSupplier(data: Prisma.SupplierCreateInput) {
    return this.prisma.supplier.create({ data });
  }

  updateSupplier(id: number, data: Prisma.SupplierUpdateInput) {
    return this.prisma.supplier.update({ where: { id }, data });
  }
}
