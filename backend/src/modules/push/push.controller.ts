import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import {
  RegisterPushTokenDto,
  RemovePushTokenDto,
} from './dto/push-token.dto.js';
import { PushService } from './push.service.js';

/** Solo el personal que debe enterarse de las compras registra sus dispositivos. */
@Controller('push')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMINISTRATOR, Role.BRANCH_MANAGER, Role.CASHIER)
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('status')
  status() {
    return this.push.status();
  }

  @Post('tokens')
  @HttpCode(200)
  register(
    @Body() dto: RegisterPushTokenDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.push.register(user.id, dto);
  }

  @Delete('tokens')
  unregister(
    @Body() dto: RemovePushTokenDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.push.unregister(user.id, dto.token);
  }
}
