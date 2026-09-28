import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '../../common/enums/role.enum.js';
import { RoleName } from '../../generated/prisma/client.js';
import { AssignRoleDto } from './dto/assign-role.dto.js';
import { RolesRepository } from './roles.repository.js';

const employeeRoles = new Set<Role>([Role.BRANCH_MANAGER, Role.CASHIER]);

@Injectable()
export class RolesService {
  constructor(private readonly rolesRepository: RolesRepository) {}

  findAll() {
    return this.rolesRepository.findAll();
  }

  async assign(userId: number, role: Role, dto: AssignRoleDto) {
    const [user, roleRecord] = await Promise.all([
      this.rolesRepository.findUserContext(userId),
      this.rolesRepository.findByName(role as unknown as RoleName),
    ]);

    if (!user) {
      throw new NotFoundException(`User ${userId} was not found`);
    }
    if (!roleRecord) {
      throw new NotFoundException(`Role ${role} is not initialized`);
    }

    const requiresEmployee = employeeRoles.has(role);
    const branchId = dto.branchId ?? user.employee?.branchId;
    if (requiresEmployee && !branchId) {
      throw new BadRequestException(
        'branchId is required when assigning an employee role',
      );
    }
    if (branchId && !(await this.rolesRepository.branchExists(branchId))) {
      throw new BadRequestException(
        'The selected branch does not exist or is inactive',
      );
    }

    return this.rolesRepository.assign(userId, roleRecord.id, roleRecord.name, {
      client:
        role === Role.CUSTOMER
          ? { phone: dto.phone, address: dto.address }
          : undefined,
      employee: requiresEmployee
        ? {
            branchId: branchId!,
            jobTitle:
              dto.jobTitle ??
              user.employee?.jobTitle ??
              (role === Role.BRANCH_MANAGER ? 'Encargado' : 'Cajero'),
          }
        : undefined,
    });
  }

  async remove(userId: number, role: Role) {
    const [user, roleRecord] = await Promise.all([
      this.rolesRepository.findUserContext(userId),
      this.rolesRepository.findByName(role as unknown as RoleName),
    ]);

    if (!user) {
      throw new NotFoundException(`User ${userId} was not found`);
    }
    if (!roleRecord) {
      throw new NotFoundException(`Role ${role} is not initialized`);
    }
    if (!(await this.rolesRepository.hasAssignment(userId, roleRecord.id))) {
      throw new NotFoundException(`User ${userId} does not have role ${role}`);
    }
    if (user._count.roles <= 1) {
      throw new ConflictException('A user must retain at least one role');
    }

    return this.rolesRepository.remove(userId, roleRecord.id);
  }
}
