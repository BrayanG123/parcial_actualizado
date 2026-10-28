import { Injectable } from '@nestjs/common';
import { tenantContext } from '../../common/tenant/tenant-context.js';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import { reportingDateBetween } from '../reports/reports.repository.js';

/** Maximo de series producto-sucursal que acepta el servicio de ML. */
export const MAX_SERIES = 5000;
const HISTORY_WEEKS = 156;
const historyStart = () =>
  new Date(Date.now() - HISTORY_WEEKS * 7 * 86_400_000);

/**
 * Datos agregados que se envian al servicio de ML. Las consultas `$queryRaw` filtran
 * `id_empresa` explicitamente; nunca se envian nombres de clientes ni datos de contacto.
 */
@Injectable()
export class MlRepository {
  constructor(private readonly prisma: PrismaService) {}

  employee(userId: number) {
    return this.prisma.employee.findUnique({
      where: { userId },
      select: { active: true, branchId: true },
    });
  }

  async catalogShape() {
    const branches = await this.prisma.branch.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    });
    const products = await this.prisma.product.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        price: true,
        categoryId: true,
        category: { select: { name: true } },
      },
      orderBy: { id: 'asc' },
      take: Math.floor(MAX_SERIES / Math.max(1, branches.length)),
    });
    return {
      branches,
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        categoryId: p.categoryId ?? 0,
        categoryName: p.category?.name ?? null,
        price: Number(p.price),
      })),
    };
  }

  /** Unidades por semana (lunes, hora de Bolivia), producto y sucursal. */
  weeklySales() {
    return this.prisma.$queryRaw<
      Array<{
        week: string;
        productId: number;
        branchId: number;
        categoryId: number;
        price: number;
        discount: number;
        units: number;
      }>
    >`
      SELECT date_trunc('week', COALESCE(v.fecha_confirmacion, v.fecha) AT TIME ZONE 'America/La_Paz')::date::text AS week,
        d.id_producto AS "productId", v.id_sucursal AS "branchId", COALESCE(p.id_categoria, 0) AS "categoryId",
        AVG(d.precio_unitario)::float AS price,
        COALESCE(AVG(d.descuento / NULLIF(d.precio_unitario, 0)), 0)::float AS discount,
        SUM(d.cantidad)::float AS units
      FROM ventas v
      JOIN detalles_venta d ON d.id_venta = v.id_venta
      JOIN productos p ON p.id_producto = d.id_producto
      WHERE v.id_empresa = ${tenantContext.requireTenantId()}
        AND v.estado = 'COMPLETED' AND v.id_sucursal IS NOT NULL
        AND ${reportingDateBetween(historyStart())}
      GROUP BY 1, 2, 3, 4 ORDER BY 1`;
  }

  /** Compras por cliente (solo id interno, fecha e importe) para la segmentacion RFM. */
  transactions() {
    return this.prisma.$queryRaw<
      Array<{ customerId: number; date: string; amount: number }>
    >`
      SELECT v.id_cliente AS "customerId",
        (COALESCE(v.fecha_confirmacion, v.fecha) AT TIME ZONE 'America/La_Paz')::date::text AS date,
        v.total::float AS amount
      FROM ventas v
      WHERE v.id_empresa = ${tenantContext.requireTenantId()}
        AND v.estado = 'COMPLETED' AND v.id_cliente IS NOT NULL
        AND ${reportingDateBetween(historyStart())}`;
  }

  async names(productIds: number[], branchIds: number[]) {
    const [products, branches] = await Promise.all([
      this.prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, category: { select: { name: true } } },
      }),
      this.prisma.branch.findMany({
        where: { id: { in: branchIds } },
        select: { id: true, name: true },
      }),
    ]);
    return {
      products: new Map(products.map((p) => [p.id, p])),
      branches: new Map(branches.map((b) => [b.id, b.name])),
    };
  }
}
