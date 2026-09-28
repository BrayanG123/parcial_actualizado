import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  CashShiftsReportQueryDto,
  InventoryReportQueryDto,
  SalesReportQueryDto,
} from './dto/report-query.dto.js';
import { reportPeriod } from './report-period.js';

type Period = ReturnType<typeof reportPeriod>;
@Injectable()
export class ReportsRepository {
  constructor(private readonly prisma: PrismaService) {}
  employee(userId: number) {
    return this.prisma.employee.findUnique({
      where: { userId },
      select: { active: true, branchId: true },
    });
  }

  private salesBase(query: SalesReportQueryDto, period: Period) {
    return Prisma.sql`
      WITH sales AS (
        SELECT v.*, COALESCE(v.fecha_confirmacion, v.fecha) AS reporting_date,
          (SELECT COALESCE(SUM(d.cantidad), 0) FROM detalles_venta d WHERE d.id_venta = v.id_venta) AS units
        FROM ventas v
        WHERE v.estado = 'COMPLETED'
          AND COALESCE(v.fecha_confirmacion, v.fecha) >= ${period.start}
          AND COALESCE(v.fecha_confirmacion, v.fecha) < ${period.endExclusive}
          ${query.branchId ? Prisma.sql`AND v.id_sucursal = ${query.branchId}` : Prisma.empty}
          ${query.channel ? Prisma.sql`AND v.canal::text = ${query.channel}` : Prisma.empty}
          ${query.currency ? Prisma.sql`AND v.moneda = ${query.currency}` : Prisma.empty}
      )`;
  }

  async sales(query: SalesReportQueryDto, period: Period) {
    const base = this.salesBase(query, period);
    const metrics = Prisma.sql`COUNT(*)::int AS "saleCount", SUM(v.units) AS "unitsSold",
      SUM(v.total) AS "revenue", ROUND(AVG(v.total), 2) AS "averageTicket"`;
    const [totals, byBranch, byChannel, daily, hourly] =
      await this.prisma.$transaction(
        [
          this.prisma
            .$queryRaw`${base} SELECT v.moneda AS currency, ${metrics} FROM sales v GROUP BY v.moneda ORDER BY v.moneda`,
          this.prisma
            .$queryRaw`${base} SELECT v.id_sucursal AS "branchId", s.nombre AS "branchName", v.moneda AS currency, ${metrics}
        FROM sales v LEFT JOIN sucursales s ON s.id_sucursal = v.id_sucursal
        GROUP BY v.id_sucursal, s.nombre, v.moneda ORDER BY v.id_sucursal, v.moneda`,
          this.prisma
            .$queryRaw`${base} SELECT v.canal::text AS channel, v.moneda AS currency, ${metrics}
        FROM sales v GROUP BY v.canal, v.moneda ORDER BY v.canal, v.moneda`,
          this.prisma
            .$queryRaw`${base} SELECT (v.reporting_date AT TIME ZONE 'America/La_Paz')::date::text AS date, v.moneda AS currency, ${metrics}
        FROM sales v GROUP BY date, v.moneda ORDER BY date, v.moneda`,
          // Hora local de Bolivia (0-23) para detectar horarios de mayor venta.
          this.prisma
            .$queryRaw`${base} SELECT EXTRACT(HOUR FROM (v.reporting_date AT TIME ZONE 'America/La_Paz'))::int AS hour, v.moneda AS currency, ${metrics}
        FROM sales v GROUP BY hour, v.moneda ORDER BY hour, v.moneda`,
        ],
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      );
    return { totals, byBranch, byChannel, daily, hourly };
  }

  /** Turnos abiertos en el periodo, agregados por moneda y por caja. */
  async cashShifts(query: CashShiftsReportQueryDto, period: Period) {
    const base = Prisma.sql`WITH shifts AS (
      SELECT t.id_turno AS id, t.id_caja AS "registerId", c.nombre AS "registerName",
        c.id_sucursal AS "branchId", s.nombre AS "branchName", u.nombre AS cashier,
        t.fecha_apertura AS "openedAt", t.fecha_cierre AS "closedAt", t.moneda AS currency,
        t.saldo_inicial AS "openingCash", t.ventas_efectivo AS cash, t.ventas_tarjeta AS card,
        t.ventas_qr AS qr, t.ventas_transferencia AS transfer,
        t.ventas_efectivo + t.ventas_tarjeta + t.ventas_qr + t.ventas_transferencia AS total,
        t.cantidad_ventas AS "saleCount", t.saldo_inicial + t.ventas_efectivo AS "expectedCash",
        t.efectivo_contado AS "countedCash",
        CASE WHEN t.efectivo_contado IS NULL THEN NULL
          ELSE t.efectivo_contado - (t.saldo_inicial + t.ventas_efectivo) END AS difference
      FROM turnos_caja t
      JOIN cajas c ON c.id_caja = t.id_caja
      JOIN sucursales s ON s.id_sucursal = c.id_sucursal
      JOIN usuarios u ON u.id_usuario = t.id_usuario
      WHERE t.fecha_apertura >= ${period.start} AND t.fecha_apertura < ${period.endExclusive}
        ${query.branchId ? Prisma.sql`AND c.id_sucursal = ${query.branchId}` : Prisma.empty}
        ${query.registerId ? Prisma.sql`AND t.id_caja = ${query.registerId}` : Prisma.empty}
    )`;
    const metrics = Prisma.sql`COUNT(*)::int AS "shiftCount",
      COUNT(*) FILTER (WHERE "closedAt" IS NULL)::int AS "openShifts",
      COALESCE(SUM("saleCount"), 0)::int AS "saleCount",
      COALESCE(SUM(cash), 0) AS cash, COALESCE(SUM(card), 0) AS card,
      COALESCE(SUM(qr), 0) AS qr, COALESCE(SUM(transfer), 0) AS transfer,
      COALESCE(SUM(total), 0) AS total, COALESCE(SUM(difference), 0) AS difference,
      COUNT(*) FILTER (WHERE difference <> 0)::int AS "shiftsWithDifference"`;
    const [totals, byRegister, shifts] = await this.prisma.$transaction(
      [
        this.prisma
          .$queryRaw`${base} SELECT currency, ${metrics} FROM shifts GROUP BY currency ORDER BY currency`,
        this.prisma
          .$queryRaw`${base} SELECT "registerId", "registerName", "branchId", "branchName", currency, ${metrics}
        FROM shifts GROUP BY "registerId", "registerName", "branchId", "branchName", currency
        ORDER BY "branchId", "registerId", currency`,
        this.prisma
          .$queryRaw`${base} SELECT * FROM shifts ORDER BY "openedAt" DESC, id DESC LIMIT 100`,
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return { totals, byRegister, shifts };
  }

  topProducts(query: SalesReportQueryDto & { limit: number }, period: Period) {
    return this.prisma.$queryRaw`${this.salesBase(query, period)},
      ranked AS (
        SELECT d.id_producto AS "productId", p.nombre AS "productName", v.moneda AS currency,
          SUM(d.cantidad) AS "unitsSold", COUNT(DISTINCT v.id_venta)::int AS "saleCount",
          SUM(d.cantidad * (d.precio_unitario - d.descuento)) AS revenue,
          ROW_NUMBER() OVER (PARTITION BY v.moneda ORDER BY SUM(d.cantidad) DESC,
            SUM(d.cantidad * (d.precio_unitario - d.descuento)) DESC, d.id_producto) AS rank
        FROM sales v JOIN detalles_venta d ON d.id_venta = v.id_venta
        JOIN productos p ON p.id_producto = d.id_producto
        GROUP BY d.id_producto, p.nombre, v.moneda
      ) SELECT * FROM ranked WHERE rank <= ${query.limit} ORDER BY currency, rank`;
  }

  async inventory(query: InventoryReportQueryDto) {
    const base = Prisma.sql`WITH stock AS (
      SELECT i.id_inventario AS id, i.id_sucursal AS "branchId", s.nombre AS "branchName", s.activa AS "branchActive",
        i.id_producto AS "productId", p.nombre AS "productName", p.activo AS "productActive",
        i.id_talla AS "sizeId", t.nombre AS "sizeName", i.id_color AS "colorId", c.nombre AS "colorName",
        i.cantidad_fisica AS physical, i.cantidad_reservada AS reserved,
        i.cantidad_fisica - i.cantidad_reservada AS available,
        COALESCE((SELECT SUM(m.cantidad) FROM movimientos_inventario m
          WHERE m.id_inventario = i.id_inventario AND m.tipo = 'PENDING_ENTRY' AND m.estado = 'PENDING'), 0) AS incoming
      FROM inventarios i JOIN sucursales s ON s.id_sucursal = i.id_sucursal
      JOIN productos p ON p.id_producto = i.id_producto JOIN tallas t ON t.id_talla = i.id_talla JOIN colores c ON c.id_color = i.id_color
      WHERE 1 = 1
      ${query.branchId ? Prisma.sql`AND i.id_sucursal = ${query.branchId}` : Prisma.empty}
      ${query.categoryId ? Prisma.sql`AND p.id_categoria = ${query.categoryId}` : Prisma.empty}
      ${query.productId ? Prisma.sql`AND i.id_producto = ${query.productId}` : Prisma.empty}
    ), filtered AS (SELECT * FROM stock ${query.lowStockOnly === 'true' ? Prisma.sql`WHERE available <= ${query.lowStockThreshold}` : Prisma.empty})`;
    const metrics = Prisma.sql`COUNT(*)::int AS "variantCount", COALESCE(SUM(physical), 0) AS physical,
      COALESCE(SUM(reserved), 0) AS reserved, COALESCE(SUM(available), 0) AS available,
      COALESCE(SUM(incoming), 0) AS incoming,
      COUNT(*) FILTER (WHERE available <= ${query.lowStockThreshold})::int AS "lowStockCount",
      COUNT(*) FILTER (WHERE available = 0)::int AS "outOfStockCount"`;
    const [summary, byBranch, items] = await this.prisma.$transaction(
      [
        this.prisma.$queryRaw<
          Array<{ variantCount: number }>
        >`${base} SELECT ${metrics} FROM filtered`,
        this.prisma
          .$queryRaw`${base} SELECT "branchId", "branchName", ${metrics}
        FROM filtered GROUP BY "branchId", "branchName" ORDER BY "branchId"`,
        this.prisma
          .$queryRaw`${base} SELECT *, (available <= ${query.lowStockThreshold}) AS "lowStock"
        FROM filtered ORDER BY available, id LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}`,
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const total = summary[0]?.variantCount ?? 0;
    return {
      summary: summary[0],
      byBranch,
      items,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  reservations(branchId: number | undefined, period: Period) {
    return this.prisma.$queryRaw`
      SELECT r.id_sucursal AS "branchId", s.nombre AS "branchName", r.estado::text AS status, COUNT(*)::int AS count
      FROM reservas r JOIN sucursales s ON s.id_sucursal = r.id_sucursal
      WHERE r.horario_aproximado >= ${period.start} AND r.horario_aproximado < ${period.endExclusive}
        ${branchId ? Prisma.sql`AND r.id_sucursal = ${branchId}` : Prisma.empty}
      GROUP BY r.id_sucursal, s.nombre, r.estado ORDER BY r.id_sucursal, r.estado`;
  }
}
