import { Injectable } from '@nestjs/common';
import { Prisma, ReservationStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma/prisma.service.js';

const branchSelect = {
  id: true,
  name: true,
  city: true,
  address: true,
  phone: true,
  warehouseName: true,
  active: true,
  _count: {
    select: {
      employees: true,
      inventory: true,
      reservations: true,
      sales: true,
    },
  },
} satisfies Prisma.BranchSelect;

interface FindBranchesOptions {
  page: number;
  limit: number;
  city?: string;
  search?: string;
  active?: boolean;
}

@Injectable()
export class BranchesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: number) {
    return this.prisma.branch.findUnique({
      where: { id },
      select: branchSelect,
    });
  }

  findByCityAndName(city: string, name: string) {
    return this.prisma.branch.findUnique({
      where: { city_name: { city, name } },
      select: { id: true },
    });
  }

  async findAll(options: FindBranchesOptions) {
    const { page, limit, city, search, active } = options;
    const where: Prisma.BranchWhereInput = {
      active,
      ...(city ? { city: { equals: city, mode: 'insensitive' as const } } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { city: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.branch.findMany({
        where,
        select: branchSelect,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ city: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.branch.count({ where }),
    ]);

    return { data, total };
  }

  create(data: Prisma.BranchCreateInput) {
    return this.prisma.branch.create({
      data: { ...data, cashRegisters: { create: { name: 'Caja 1' } } },
      select: branchSelect,
    });
  }

  update(id: number, data: Prisma.BranchUpdateInput) {
    return this.prisma.branch.update({
      where: { id },
      data,
      select: branchSelect,
    });
  }

  hasOpenReservations(id: number): Promise<boolean> {
    return this.prisma.reservation
      .count({
        where: {
          branchId: id,
          status: {
            in: [
              ReservationStatus.PENDING,
              ReservationStatus.PREPARING,
              ReservationStatus.READY,
              ReservationStatus.CUSTOMER_PRESENT,
            ],
          },
        },
      })
      .then((count) => count > 0);
  }

  deactivate(id: number) {
    return this.prisma.branch.update({
      where: { id },
      data: { active: false },
      select: branchSelect,
    });
  }
}
