import { Injectable } from '@nestjs/common';
import { RoleName } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import { userPublicSelect } from '../users/users.repository.js';

interface AssignRoleProfile {
  client?: {
    phone?: string;
    address?: string;
  };
  employee?: {
    branchId: number;
    jobTitle: string;
  };
}

@Injectable()
export class RolesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.role.findMany({
      include: { _count: { select: { users: true } } },
      orderBy: { id: 'asc' },
    });
  }

  findByName(name: RoleName) {
    return this.prisma.role.findUnique({ where: { name } });
  }

  findUserContext(userId: number) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        client: true,
        employee: true,
        _count: { select: { roles: true } },
      },
    });
  }

  branchExists(branchId: number): Promise<boolean> {
    return this.prisma.branch
      .count({ where: { id: branchId, active: true } })
      .then((count) => count > 0);
  }

  hasAssignment(userId: number, roleId: number): Promise<boolean> {
    return this.prisma.userRole
      .count({ where: { userId, roleId } })
      .then((count) => count > 0);
  }

  assign(
    userId: number,
    roleId: number,
    roleName: RoleName,
    profile: AssignRoleProfile,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.userRole.upsert({
        where: { userId_roleId: { userId, roleId } },
        update: {},
        create: { userId, roleId },
      });

      if (roleName === RoleName.CUSTOMER) {
        await transaction.client.upsert({
          where: { userId },
          update: profile.client ?? {},
          create: { userId, ...profile.client },
        });
      }

      if (profile.employee) {
        await transaction.employee.upsert({
          where: { userId },
          update: profile.employee,
          create: { userId, ...profile.employee },
        });
      }

      return transaction.user.findUniqueOrThrow({
        where: { id: userId },
        select: userPublicSelect,
      });
    });
  }

  remove(userId: number, roleId: number) {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.userRole.delete({
        where: { userId_roleId: { userId, roleId } },
      });

      return transaction.user.findUniqueOrThrow({
        where: { id: userId },
        select: userPublicSelect,
      });
    });
  }
}
