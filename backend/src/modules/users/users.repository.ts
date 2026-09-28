import { Injectable } from '@nestjs/common';
import { Prisma, RoleName } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma/prisma.service.js';

export const userPublicSelect = {
  supplier: { select: { id: true, name: true, active: true } },
  supplierId: true,
  id: true,
  name: true,
  email: true,
  active: true,
  registeredAt: true,
  updatedAt: true,
  client: true,
  employee: {
    include: {
      branch: true,
    },
  },
  roles: {
    select: {
      role: true,
    },
  },
} satisfies Prisma.UserSelect;

const userAuthenticationSelect = {
  ...userPublicSelect,
  passwordHash: true,
} satisfies Prisma.UserSelect;

interface CreateUserRecord {
  supplierId?: number;
  name: string;
  email: string;
  passwordHash: string;
  active: boolean;
  roleIds: number[];
  client?: {
    phone?: string;
    address?: string;
    wholesale?: boolean;
  };
  employee?: {
    branchId: number;
    jobTitle: string;
  };
}

interface FindUsersOptions {
  page: number;
  limit: number;
  search?: string;
  active?: boolean;
  role?: RoleName;
}

interface ClientUpdate {
  wholesale?: boolean;
  phone?: string | null;
  address?: string | null;
}

interface EmployeeUpdate {
  branchId?: number;
  jobTitle?: string;
}

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: number) {
    return this.prisma.user.findUnique({
      where: { id },
      select: userPublicSelect,
    });
  }

  findByIdForAuthentication(id: number) {
    return this.prisma.user.findUnique({
      where: { id },
      select: userAuthenticationSelect,
    });
  }

  findByEmailForAuthentication(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: userAuthenticationSelect,
    });
  }

  findRolesByNames(names: RoleName[]) {
    return this.prisma.role.findMany({
      where: { name: { in: names } },
      select: { id: true, name: true },
    });
  }

  branchExists(id: number): Promise<boolean> {
    return this.prisma.branch
      .count({ where: { id, active: true } })
      .then((count) => count > 0);
  }

  supplierExists(id: number) {
    return this.prisma.supplier
      .count({ where: { id, active: true } })
      .then((count) => count > 0);
  }

  create(data: CreateUserRecord) {
    return this.prisma.user.create({
      data: {
        name: data.name,
        supplier: data.supplierId
          ? { connect: { id: data.supplierId } }
          : undefined,
        email: data.email,
        passwordHash: data.passwordHash,
        active: data.active,
        roles: {
          create: data.roleIds.map((roleId) => ({
            role: { connect: { id: roleId } },
          })),
        },
        client: data.client ? { create: data.client } : undefined,
        employee: data.employee ? { create: data.employee } : undefined,
      },
      select: userPublicSelect,
    });
  }

  async findAll(options: FindUsersOptions) {
    const { page, limit, search, active, role } = options;
    const where: Prisma.UserWhereInput = {
      active,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(role
        ? {
            roles: {
              some: { role: { name: role } },
            },
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: userPublicSelect,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { registeredAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data, total };
  }

  update(
    id: number,
    userData: Prisma.UserUpdateInput,
    clientData?: ClientUpdate,
    employeeData?: EmployeeUpdate,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({ where: { id }, data: userData });

      if (clientData) {
        await transaction.client.update({
          where: { userId: id },
          data: clientData,
        });
      }

      if (employeeData) {
        await transaction.employee.update({
          where: { userId: id },
          data: employeeData,
        });
      }

      return transaction.user.findUniqueOrThrow({
        where: { id },
        select: userPublicSelect,
      });
    });
  }

  deactivate(id: number) {
    return this.prisma.user.update({
      where: { id },
      data: { active: false },
      select: userPublicSelect,
    });
  }
}
