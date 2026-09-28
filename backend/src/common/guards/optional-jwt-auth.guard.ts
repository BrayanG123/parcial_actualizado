import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Identifica al usuario si envia un token valido; sin token la ruta sigue siendo publica. */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser>(error: unknown, user: TUser | false): TUser {
    return (error || !user ? undefined : user) as TUser;
  }
}
