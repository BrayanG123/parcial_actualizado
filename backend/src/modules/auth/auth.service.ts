import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcrypt';
import { Role } from '../../common/enums/role.enum.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { UsersService } from '../users/users.service.js';

export interface JwtPayload {
  sub: number;
  email: string;
  roles: Role[];
}

interface TokenUser {
  id: number;
  email: string;
  roles: Array<{ role: { name: string } }>;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const user = await this.usersService.createCustomer(dto);
    return this.createSession(user);
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmailForAuthentication(
      dto.email,
    );
    const validPassword = user
      ? await compare(dto.password, user.passwordHash)
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
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      tokenType: 'Bearer' as const,
      user,
    };
  }
}
