import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash } from 'bcrypt';
import { Role } from '../../common/enums/role.enum.js';
import { RoleName } from '../../generated/prisma/client.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UsersRepository } from './users.repository.js';

interface CustomerRegistrationData {
  name: string;
  email: string;
  password: string;
  phone?: string;
  address?: string;
}

const employeeRoles = new Set<Role>([Role.BRANCH_MANAGER, Role.CASHIER]);

@Injectable()
export class UsersService {
  private readonly passwordSaltRounds: number;

  constructor(
    private readonly usersRepository: UsersRepository,
    configService: ConfigService,
  ) {
    this.passwordSaltRounds =
      configService.get<number>('app.passwordSaltRounds') ?? 12;
  }

  async create(dto: CreateUserDto) {
    return this.createWithRoles(dto, dto.roles);
  }

  async createCustomer(data: CustomerRegistrationData) {
    return this.createWithRoles(data, [Role.CUSTOMER]);
  }

  async findAll(query: ListUsersQueryDto) {
    const result = await this.usersRepository.findAll({
      ...query,
      role: query.role as unknown as RoleName | undefined,
    });

    return {
      data: result.data,
      meta: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  }

  async findOne(id: number) {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException(`User ${id} was not found`);
    }
    return user;
  }

  async findActiveForAuthentication(id: number) {
    const user = await this.usersRepository.findByIdForAuthentication(id);
    return user?.active ? user : null;
  }

  findByEmailForAuthentication(email: string) {
    return this.usersRepository.findByEmailForAuthentication(
      email.trim().toLowerCase(),
    );
  }

  async update(id: number, dto: UpdateUserDto) {
    const current = await this.findOne(id);
    if (dto.supplierId != null && dto.supplierId !== current.supplierId) {
      await this.validateSupplier(
        dto.supplierId,
        current.roles.some((r) => r.role.name === 'SUPPLIER'),
      );
    }

    if (dto.email && dto.email !== current.email) {
      const existing = await this.findByEmailForAuthentication(dto.email);
      if (existing) {
        throw new ConflictException('Email is already registered');
      }
    }

    if (dto.branchId && !current.employee) {
      throw new BadRequestException(
        'The user does not have an employee profile',
      );
    }
    if (
      dto.branchId &&
      !(await this.usersRepository.branchExists(dto.branchId))
    ) {
      throw new BadRequestException(
        'The selected branch does not exist or is inactive',
      );
    }
    if (
      (dto.phone !== undefined ||
        dto.address !== undefined ||
        dto.wholesale !== undefined) &&
      !current.client
    ) {
      throw new BadRequestException(
        'The user does not have a customer profile',
      );
    }

    const passwordHash = dto.password
      ? await hash(dto.password, this.passwordSaltRounds)
      : undefined;

    return this.usersRepository.update(
      id,
      {
        name: dto.name,
        supplier:
          dto.supplierId === undefined
            ? undefined
            : dto.supplierId === null
              ? { disconnect: true }
              : { connect: { id: dto.supplierId } },
        email: dto.email,
        active: dto.active,
        passwordHash,
      },
      dto.phone !== undefined ||
        dto.address !== undefined ||
        dto.wholesale !== undefined
        ? { phone: dto.phone, address: dto.address, wholesale: dto.wholesale }
        : undefined,
      dto.branchId !== undefined || dto.jobTitle !== undefined
        ? { branchId: dto.branchId, jobTitle: dto.jobTitle }
        : undefined,
    );
  }

  /** Autoservicio: nombre para cualquier cuenta; telefono y direccion solo con perfil de cliente. */
  async updateOwnProfile(
    id: number,
    data: { name?: string; phone?: string; address?: string },
  ) {
    const current = await this.findOne(id);
    const clientFields = data.phone !== undefined || data.address !== undefined;
    if (clientFields && !current.client) {
      throw new BadRequestException(
        'The user does not have a customer profile',
      );
    }
    return this.usersRepository.update(
      id,
      { name: data.name },
      clientFields
        ? {
            phone: data.phone === undefined ? undefined : data.phone || null,
            address:
              data.address === undefined ? undefined : data.address || null,
          }
        : undefined,
    );
  }

  async deactivate(id: number) {
    await this.findOne(id);
    return this.usersRepository.deactivate(id);
  }

  private async createWithRoles(
    data: CustomerRegistrationData & Partial<CreateUserDto>,
    roles: Role[],
  ) {
    const email = data.email.trim().toLowerCase();
    if (data.supplierId != null)
      await this.validateSupplier(
        data.supplierId,
        roles.includes(Role.SUPPLIER),
      );
    if (await this.findByEmailForAuthentication(email)) {
      throw new ConflictException('Email is already registered');
    }

    const prismaRoles = roles.map((role) => role as unknown as RoleName);
    const roleRecords =
      await this.usersRepository.findRolesByNames(prismaRoles);
    if (roleRecords.length !== prismaRoles.length) {
      throw new BadRequestException(
        'Database roles are not initialized; execute the seed first',
      );
    }

    if (data.wholesale && !roles.includes(Role.CUSTOMER))
      throw new BadRequestException('Solo un cliente puede ser mayorista');
    const requiresEmployee = roles.some((role) => employeeRoles.has(role));
    if (requiresEmployee && !data.branchId) {
      throw new BadRequestException(
        'branchId is required for branch managers and cashiers',
      );
    }
    if (
      data.branchId &&
      !(await this.usersRepository.branchExists(data.branchId))
    ) {
      throw new BadRequestException(
        'The selected branch does not exist or is inactive',
      );
    }

    const passwordHash = await hash(data.password, this.passwordSaltRounds);
    return this.usersRepository.create({
      name: data.name.trim(),
      supplierId: data.supplierId,
      email,
      passwordHash,
      active: data.active ?? true,
      roleIds: roleRecords.map((role) => role.id),
      client: roles.includes(Role.CUSTOMER)
        ? {
            phone: data.phone,
            address: data.address,
            wholesale: data.wholesale ?? false,
          }
        : undefined,
      employee: requiresEmployee
        ? {
            branchId: data.branchId!,
            jobTitle:
              data.jobTitle ??
              (roles.includes(Role.BRANCH_MANAGER) ? 'Encargado' : 'Cajero'),
          }
        : undefined,
    });
  }

  private async validateSupplier(id: number, hasRole: boolean) {
    if (!hasRole)
      throw new BadRequestException(
        'Asigna primero el rol PROVEEDOR para vincular la cuenta.',
      );
    if (!(await this.usersRepository.supplierExists(id)))
      throw new BadRequestException('El proveedor no existe o esta inactivo.');
  }
}
