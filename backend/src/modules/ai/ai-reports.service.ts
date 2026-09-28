import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import {
  CashShiftsReportQueryDto,
  InventoryReportQueryDto,
  PeriodReportQueryDto,
  SalesReportQueryDto,
  TopProductsQueryDto,
} from '../reports/dto/report-query.dto.js';
import { ReportsService } from '../reports/reports.service.js';
import { REPORT_INTENT_SYSTEM, REPORT_SUMMARY_SYSTEM } from './ai-prompts.js';
import { AiRepository } from './ai.repository.js';
import { AiReportQueryDto } from './dto/ai.dto.js';
import {
  AI_PROVIDER,
  type AiProvider,
  AiUnavailableError,
} from './providers/ai-provider.js';
import {
  type BranchOption,
  parseIntentWithRules,
  type ReportIntent,
  sanitizeIntent,
  todayBolivia,
} from './report-intent.js';

type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] =>
  Array.isArray(value) ? (value as Row[]) : [];
const num = (value: unknown) => (typeof value === 'number' ? value : 0);
const bs = (value: unknown) => `Bs ${num(value).toFixed(2)}`;
const RESERVATION_STATUS: Record<string, string> = {
  PENDING: 'pendientes',
  PREPARING: 'en preparacion',
  READY: 'listas',
  CUSTOMER_PRESENT: 'con cliente en tienda',
  COMPLETED: 'atendidas',
  CANCELLED: 'canceladas',
  EXPIRED: 'vencidas',
};

/** Reportes bajo demanda: la IA interpreta, ReportsService consulta con permisos. */
@Injectable()
export class AiReportsService {
  private readonly logger = new Logger(AiReportsService.name);

  constructor(
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
    private readonly repository: AiRepository,
    private readonly reports: ReportsService,
  ) {}

  async query(dto: AiReportQueryDto, user: AuthenticatedUser) {
    const scopedBranch = user.roles.includes(Role.ADMINISTRATOR)
      ? undefined
      : (await this.repository.employee(user.id))?.branchId;
    // Se valida contra todas las sucursales activas para detectar cuando el
    // encargado pide otra y avisarle; al modelo solo se le ofrecen las autorizadas.
    const todas = await this.repository.branches();
    const branches = scopedBranch
      ? todas.filter((b) => b.id === scopedBranch)
      : todas;
    const today = todayBolivia();

    let intent: ReportIntent;
    let source: string = this.provider.name;
    try {
      intent = sanitizeIntent(
        await this.provider.generateJson({
          system: REPORT_INTENT_SYSTEM,
          temperature: 0,
          prompt: `HOY: ${today}\nSUCURSALES: ${JSON.stringify(branches)}\nSOLICITUD: ${dto.question}`,
        }),
        todas,
      );
    } catch (error) {
      this.warn('report intent', error);
      intent = parseIntentWithRules(dto.question, todas, today);
      source = 'rules';
    }
    // El encargado siempre consulta su sucursal; ReportsService lo vuelve a validar.
    if (scopedBranch && intent.branchId !== scopedBranch) {
      if (intent.branchId === undefined) intent.branchId = scopedBranch;
      else {
        intent.branchId = scopedBranch;
        intent.explanation += ' Se limito a tu sucursal asignada.';
      }
    }

    const result = await this.run(intent, user);
    let summary = summarize(intent, result);
    if (source !== 'rules')
      try {
        const output = (await this.provider.generateJson({
          system: REPORT_SUMMARY_SYSTEM,
          temperature: 0.2,
          prompt: JSON.stringify({
            solicitud: dto.question,
            interpretacion: intent.explanation,
            resultado: compact(intent, result),
          }),
        })) as { summary?: unknown };
        if (typeof output?.summary === 'string' && output.summary.trim())
          summary = output.summary.trim().slice(0, 1200);
      } catch (error) {
        this.warn('report summary', error);
      }

    return {
      question: dto.question,
      source,
      model: source === 'rules' ? null : this.provider.model,
      interpretation: {
        ...intent,
        branchName:
          todas.find((b: BranchOption) => b.id === intent.branchId)?.name ??
          null,
      },
      summary,
      result,
    };
  }

  private run(intent: ReportIntent, user: AuthenticatedUser) {
    const period = {
      from: intent.from,
      to: intent.to,
      branchId: intent.branchId,
    };
    switch (intent.report) {
      case 'top-products':
        return this.reports.topProducts(
          Object.assign(new TopProductsQueryDto(), period, {
            channel: intent.channel,
            limit: intent.limit ?? 10,
          }),
          user,
        );
      case 'inventory':
        return this.reports.inventory(
          Object.assign(new InventoryReportQueryDto(), {
            branchId: intent.branchId,
            lowStockOnly: intent.lowStockOnly ? 'true' : 'false',
            lowStockThreshold: intent.lowStockThreshold ?? 5,
            limit: intent.limit ?? 20,
          }),
          user,
        );
      case 'cash-shifts':
        return this.reports.cashShifts(
          Object.assign(new CashShiftsReportQueryDto(), period),
          user,
        );
      case 'reservations':
        return this.reports.reservations(
          Object.assign(new PeriodReportQueryDto(), period),
          user,
        );
      default:
        return this.reports.sales(
          Object.assign(new SalesReportQueryDto(), period, {
            channel: intent.channel,
          }),
          user,
        );
    }
  }

  private warn(step: string, error: unknown) {
    if (error instanceof AiUnavailableError)
      this.logger.warn(`${step}: ${error.message}; using rules`);
    else throw error;
  }
}

/** Solo lo necesario para el resumen; evita enviar filas extensas al modelo. */
function compact(intent: ReportIntent, value: unknown) {
  const result = (value ?? {}) as Row;
  switch (intent.report) {
    case 'sales':
      return {
        periodo: result.period,
        totales: result.totals,
        porSucursal: result.byBranch,
        porCanal: result.byChannel,
        porHora: result.hourly,
        diasConVentas: rows(result.daily).length,
      };
    case 'cash-shifts':
      return {
        periodo: result.period,
        totales: result.totals,
        porCaja: result.byRegister,
        turnos: rows(result.shifts).slice(0, 15),
      };
    case 'inventory':
      return {
        resumen: result.summary,
        porSucursal: result.byBranch,
        primeras: rows(result.items).slice(0, 10),
      };
    default:
      return { periodo: result.period, items: rows(result.items).slice(0, 20) };
  }
}

export function summarize(intent: ReportIntent, value: unknown): string {
  const result = (value ?? {}) as Row;
  const period = (result.period ?? {}) as Row;
  const range = `del ${String(period.from)} al ${String(period.to)}`;
  switch (intent.report) {
    case 'sales': {
      const total = rows(result.totals)[0];
      if (!total) return `No hubo ventas completadas ${range}.`;
      const best = [...rows(result.byBranch)].sort(
        (a, b) => num(b.revenue) - num(a.revenue),
      )[0];
      return `Ventas completadas ${range}: ${num(total.saleCount)} ventas por ${bs(total.revenue)}, ${num(total.unitsSold)} unidades y ticket promedio de ${bs(total.averageTicket)}.${best ? ` La sucursal con mayor monto fue ${String(best.branchName)} (${bs(best.revenue)}).` : ''}`;
    }
    case 'top-products': {
      const items = rows(result.items);
      if (!items.length) return `No hubo prendas vendidas ${range}.`;
      return `La prenda mas vendida ${range} fue ${String(items[0].productName)} con ${num(items[0].unitsSold)} unidades (${bs(items[0].revenue)}). El ranking incluye ${items.length} prendas.`;
    }
    case 'cash-shifts': {
      const total = rows(result.totals)[0];
      if (!total) return `No hubo turnos de caja abiertos ${range}.`;
      return `Turnos ${range}: ${num(total.shiftCount)} turnos (${num(total.openShifts)} abiertos) con ${num(total.saleCount)} ventas por ${bs(total.total)}. Efectivo ${bs(total.cash)}, tarjeta ${bs(total.card)}, QR ${bs(total.qr)} y transferencia ${bs(total.transfer)}. Diferencia de arqueo acumulada: ${bs(total.difference)} en ${num(total.shiftsWithDifference)} turnos.`;
    }
    case 'inventory': {
      const summary = (result.summary ?? {}) as Row;
      return `Inventario actual: ${num(summary.variantCount)} variantes con ${num(summary.available)} unidades disponibles, ${num(summary.lowStockCount)} con stock bajo, ${num(summary.outOfStockCount)} agotadas y ${num(summary.incoming)} unidades por ingresar.`;
    }
    default: {
      const items = rows(result.items);
      const total = items.reduce((sum, item) => sum + num(item.count), 0);
      if (!total) return `No hay reservas con cita ${range}.`;
      const byStatus = new Map<string, number>();
      for (const item of items)
        byStatus.set(
          String(item.status),
          (byStatus.get(String(item.status)) ?? 0) + num(item.count),
        );
      return `Hay ${total} reservas con cita ${range}: ${[...byStatus].map(([status, count]) => `${count} ${RESERVATION_STATUS[status] ?? status}`).join(', ')}.`;
    }
  }
}
