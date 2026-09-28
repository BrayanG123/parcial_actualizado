import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import {
  CashShiftsReportQueryDto,
  InventoryReportQueryDto,
  PeriodReportQueryDto,
  SalesReportQueryDto,
  TopProductsQueryDto,
} from './dto/report-query.dto.js';
import { reportNumbers, reportPeriod } from './report-period.js';
import { ReportsRepository } from './reports.repository.js';

@Injectable()
export class ReportsService {
  constructor(private readonly repository: ReportsRepository) {}
  private async scoped<T extends { branchId?: number }>(
    query: T,
    user: AuthenticatedUser,
  ): Promise<T> {
    if (user.roles.includes(Role.ADMINISTRATOR)) return { ...query };
    if (!user.roles.includes(Role.BRANCH_MANAGER))
      throw new ForbiddenException(
        'Report access requires an administrator or branch manager',
      );
    const employee = await this.repository.employee(user.id);
    if (!employee?.active)
      throw new ForbiddenException('An active employee profile is required');
    if (query.branchId && query.branchId !== employee.branchId)
      throw new ForbiddenException(
        'Reports are limited to your assigned branch',
      );
    return { ...query, branchId: employee.branchId };
  }
  async sales(query: SalesReportQueryDto, user: AuthenticatedUser) {
    const scoped = await this.scoped(query, user);
    const period = reportPeriod(query.from, query.to);
    return reportNumbers({
      period,
      filters: scoped,
      ...(await this.repository.sales(scoped, period)),
    });
  }
  async topProducts(query: TopProductsQueryDto, user: AuthenticatedUser) {
    const scoped = await this.scoped(query, user);
    const period = reportPeriod(query.from, query.to);
    return reportNumbers({
      period,
      filters: scoped,
      items: await this.repository.topProducts(scoped, period),
    });
  }
  async inventory(query: InventoryReportQueryDto, user: AuthenticatedUser) {
    const scoped = await this.scoped(query, user);
    return reportNumbers({
      generatedAt: new Date(),
      filters: scoped,
      ...(await this.repository.inventory(scoped)),
    });
  }
  async cashShifts(query: CashShiftsReportQueryDto, user: AuthenticatedUser) {
    const scoped = await this.scoped(query, user);
    const period = reportPeriod(query.from, query.to);
    return reportNumbers({
      period,
      filters: scoped,
      ...(await this.repository.cashShifts(scoped, period)),
    });
  }
  async reservations(query: PeriodReportQueryDto, user: AuthenticatedUser) {
    const scoped = await this.scoped(query, user);
    const period = reportPeriod(query.from, query.to);
    return reportNumbers({
      period,
      filters: scoped,
      items: await this.repository.reservations(scoped.branchId, period),
    });
  }
}
