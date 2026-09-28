import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import {
  ListNotificationsQueryDto,
  NotificationScopeQueryDto,
} from './dto/list-notifications-query.dto.js';
import { NotificationsRepository } from './notifications.repository.js';

@Injectable()
export class NotificationsService {
  constructor(private readonly repository: NotificationsRepository) {}

  private async branchScope(
    user: AuthenticatedUser,
    requestedBranchId?: number,
  ) {
    if (user.roles.includes(Role.ADMINISTRATOR)) return requestedBranchId;
    if (!user.roles.includes(Role.BRANCH_MANAGER))
      throw new ForbiddenException(
        'Notifications require an administrator or branch manager',
      );
    const employee = await this.repository.employee(user.id);
    if (!employee?.active)
      throw new ForbiddenException('An active employee profile is required');
    if (requestedBranchId && requestedBranchId !== employee.branchId)
      throw new ForbiddenException(
        'Notifications are limited to your assigned branch',
      );
    return employee.branchId;
  }

  async list(query: ListNotificationsQueryDto, user: AuthenticatedUser) {
    const branchId = await this.branchScope(user, query.branchId);
    return this.repository.list({ ...query, branchId }, user.id);
  }

  async unreadCount(query: NotificationScopeQueryDto, user: AuthenticatedUser) {
    const branchId = await this.branchScope(user, query.branchId);
    return {
      unreadCount: await this.repository.unreadCount(user.id, branchId),
    };
  }

  async markRead(id: number, user: AuthenticatedUser) {
    const branchId = await this.branchScope(user);
    const result = await this.repository.markRead(id, user.id, branchId);
    if (!result) throw new NotFoundException('Notification was not found');
    return result;
  }
}
