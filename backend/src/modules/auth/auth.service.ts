import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcrypt';
import { Role } from '../../common/enums/role.enum.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { UsersService } from '../users/users.service.js';
import { TenantsService } from '../tenancy/tenants.service.js';
import { tenantContext } from '../../common/tenant/tenant-context.js';

export interface JwtPayload {
  sub: number;
  email: string;
  roles: Role[];
  /** Ausente en tokens emitidos antes del parcial 2. */
  tenantId?: number | null;
}

interface TokenUser {
  id: number;
  email: string;
  tenantId: number | null;
  roles: Array<{ role: { name: string } }>;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly tenants: TenantsService,
  ) {}

  async register(dto: RegisterDto) {
    const user = await this.usersService.createCustomer(dto);
    return this.createSession(user);
  }

  /** Login dentro de la empresa del header X-Tenant (o la empresa por defecto). */
  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmailForAuthentication(
      dto.email,
    );
    return this.authenticate(user, dto.password);
  }

  /** Login del administrador de plataforma: usuario sin empresa con rol PLATFORM_ADMIN. */
  async platformLogin(dto: LoginDto) {
    const user = await tenantContext.runAsSystem(() =>
      this.usersService.findPlatformAdminForAuthentication(dto.email),
    );
    return this.authenticate(user, dto.password);
  }

  private async authenticate(
    user: Awaited<ReturnType<UsersService['findByEmailForAuthentication']>>,
    password: string,
  ) {
    const validPassword = user
      ? await compare(password, user.passwordHash)
      : false;

    if (!user || !user.active || !validPassword) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const { passwordHash: _passwordHash, ...safeUser } = user;
    return this.createSession(safeUser);
  }

  me(userId: number) {
    return this.usersService.findOne(userId);
  }

  updateProfile(userId: number, dto: UpdateProfileDto) {
    return this.usersService.updateOwnProfile(userId, dto);
  }

  private async createSession<T extends TokenUser>(user: T) {
    const roles = user.roles.map(({ role }) => role.name as Role);
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles,
      tenantId: user.tenantId,
    };

    const tenant =
      user.tenantId === null
        ? null
        : await this.tenants.findById(user.tenantId);
    return {
      accessToken: await this.jwtService.signAsync(payload),
      tokenType: 'Bearer' as const,
      user,
      tenant: tenant && { id: tenant.id, slug: tenant.slug, name: tenant.name },
    };
  }
}
