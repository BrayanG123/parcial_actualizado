import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator.js';
import { Role } from '../../../common/enums/role.enum.js';
import { tenantContext } from '../../../common/tenant/tenant-context.js';
import { UsersService } from '../../users/users.service.js';
import { JwtPayload } from '../auth.service.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    // El usuario se busca sin filtro: su empresa real sale de la base, no del token.
    const user = await tenantContext.runAsSystem(() =>
      this.usersService.findActiveForAuthentication(payload.sub),
    );
    if (!user) {
      throw new UnauthorizedException('User is inactive or no longer exists');
    }
    if (payload.tenantId !== undefined && payload.tenantId !== user.tenantId) {
      throw new UnauthorizedException('Token no corresponde a la empresa');
    }
    const roles = user.roles.map(({ role }) => role.name as Role);
    const store = tenantContext.getStore();
    if (store && !store.system) {
      if (
        store.source === 'header' &&
        user.tenantId !== null &&
        store.tenantId !== user.tenantId
      ) {
        throw new ForbiddenException({
          code: 'TENANT_MISMATCH',
          message: 'La sesion pertenece a otra empresa',
        });
      }
      if (user.tenantId !== null) {
        store.tenantId = user.tenantId;
        store.source = 'jwt';
      } else {
        // PLATFORM_ADMIN: sin empresa; las consultas de negocio fallan cerradas.
        store.tenantId = null;
        store.source = 'jwt';
        store.platformAdmin = roles.includes(Role.PLATFORM_ADMIN);
      }
    }

    return {
      id: user.id,
      email: user.email,
      roles,
      tenantId: user.tenantId,
    };
  }
}
