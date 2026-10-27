import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import {
  CashShiftsReportQueryDto,
  type CatalogReportFilters,
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

  /** Igual que `scoped`, pero con varias sucursales: el encargado solo ve la suya. */
  private async scopedMany(
    filters: CatalogReportFilters,
    user: AuthenticatedUser,
  ): Promise<CatalogReportFilters> {
    if (user.roles.includes(Role.ADMINISTRATOR)) return { ...filters };
    const { branchId } = await this.scoped<{ branchId?: number }>({}, user);
    if (filters.branchIds?.some((id) => id !== branchId))
      throw new ForbiddenException(
        'Reports are limited to your assigned branch',
      );
    return { ...filters, branchIds: [branchId!] };
  }

  /** Reportes del catalogo analitico (seccion 3.6): ventas agrupadas, rankings, comparaciones y existencias. */
  async catalog(
    report:
      | 'sales-grouped'
      | 'top-products'
      | 'top-categories'
      | 'branch-comparison'
      | 'low-stock',
    filters: CatalogReportFilters,
    user: AuthenticatedUser,
  ) {
    const scoped = await this.scopedMany(filters, user);
    if (report === 'low-stock')
      return reportNumbers({
        generatedAt: new Date(),
        filters: scoped,
        items: await this.repository.lowStock(scoped),
      });
    const period = reportPeriod(filters.from, filters.to);
    const items =
      report === 'top-products'
        ? await this.repository.catalogTopProducts(scoped, period)
        : report === 'top-categories'
          ? await this.repository.topCategories(scoped, period)
          : report === 'branch-comparison'
            ? await this.repository.branchComparison(scoped, period)
            : await this.repository.salesGrouped(scoped, period);
    return reportNumbers({ period, filters: scoped, items });
  }
}
