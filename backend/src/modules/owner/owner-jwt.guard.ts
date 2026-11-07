import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { tenantContext } from '../../common/tenant/tenant-context.js';
import { PrismaService } from '../../database/prisma/prisma.service.js';

export interface OwnerJwtPayload {
  sub: number;
  email: string;
  kind: 'owner';
}

export interface OwnerPrincipal {
  id: number;
  email: string;
  name: string;
}

export type OwnerRequest = Request & { owner?: OwnerPrincipal };

/**
 * Sesion de cuenta de dueño (F14): token propio (`kind: 'owner'`), que no sirve para operar
 * dentro de una empresa (JwtStrategy lo rechaza). La cuenta se vuelve a validar en la base.
 */
@Injectable()
export class OwnerJwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OwnerRequest>();
    const authorization = request.header('authorization');
    if (!authorization?.startsWith('Bearer '))
      throw new UnauthorizedException('Inicia sesion con tu cuenta');
    let payload: OwnerJwtPayload;
    try {
      payload = await this.jwt.verifyAsync<OwnerJwtPayload>(
        authorization.slice(7),
      );
    } catch {
      throw new UnauthorizedException('Tu sesion expiro');
    }
    if (payload.kind !== 'owner')
      throw new UnauthorizedException(
        'Requiere la sesion de tu cuenta de dueño',
      );
    const account = await tenantContext.runAsSystem(() =>
      this.prisma.ownerAccount.findUnique({ where: { id: payload.sub } }),
    );
    if (!account?.active)
      throw new UnauthorizedException('La cuenta no existe o esta inactiva');
    request.owner = {
      id: account.id,
      email: account.email,
      name: account.name,
    };
    return true;
  }
}
