import {
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import {
  ListNotificationsQueryDto,
  NotificationScopeQueryDto,
} from './dto/list-notifications-query.dto.js';
import { NotificationsService } from './notifications.service.js';
import { NotificationIdDto } from './dto/notification-id.dto.js';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMINISTRATOR, Role.BRANCH_MANAGER)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(
    @Query() query: ListNotificationsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notifications.list(query, user);
  }

  @Get('unread-count')
  @Header('Cache-Control', 'no-store')
  unreadCount(
    @Query() query: NotificationScopeQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notifications.unreadCount(query, user);
  }

  @Patch(':id/read')
  @Header('Cache-Control', 'no-store')
  markRead(
    @Param() params: NotificationIdDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notifications.markRead(params.id, user);
  }
}
