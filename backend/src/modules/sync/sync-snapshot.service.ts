import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import { tenantContext } from '../../common/tenant/tenant-context.js';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import { priceLine, presentLine } from '../sales/sale-pricing.js';
import { TenantsService } from '../tenancy/tenants.service.js';

/** Limite de la descarga: evita volcados masivos (RNF09). */
const MAX_VARIANTS = 2000;
const MAX_CLIENTS = 500;

/**
 * F4.6: datos para operar sin conexion en una sucursal: catalogo con variantes,
 * precios vigentes, existencias conocidas, sucursales autorizadas y clientes minimos.
 * `version` cambia cuando cambian productos o existencias de la sucursal.
 */
@Injectable()
export class SyncSnapshotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantsService,
  ) {}

  async snapshot(user: AuthenticatedUser, requestedBranchId?: number) {
    const staff = user.roles.some((r) =>
      [Role.ADMINISTRATOR, Role.BRANCH_MANAGER, Role.CASHIER].includes(r),
    );
    const employee =
      staff && !user.roles.includes(Role.ADMINISTRATOR)
        ? await this.prisma.employee.findUnique({ where: { userId: user.id } })
        : null;
    if (
      employee &&
      requestedBranchId &&
      requestedBranchId !== employee.branchId
    )
      throw new ForbiddenException(
        'Solo puedes descargar tu sucursal asignada',
      );
    const branches = await this.prisma.branch.findMany({
      where: { active: true, ...(employee ? { id: employee.branchId } : {}) },
      select: { id: true, name: true, city: true, address: true, phone: true },
      orderBy: { id: 'asc' },
    });
    const branchId = requestedBranchId ?? employee?.branchId ?? branches[0]?.id;
    const branch = branches.find((b) => b.id === branchId);
    if (!branch)
      throw new NotFoundException('Sucursal no disponible para operar offline');

    const now = new Date();
    const rows = await this.prisma.inventory.findMany({
      where: { branchId: branch.id, product: { active: true } },
      include: {
        product: {
          include: { category: { select: { id: true, name: true } } },
        },
        size: true,
        color: true,
      },
      orderBy: { id: 'asc' },
      take: MAX_VARIANTS,
    });
    let version = 0;
    const variants = rows.map((r) => {
      version = Math.max(
        version,
        r.updatedAt.getTime(),
        r.product.updatedAt.getTime(),
      );
      const line = presentLine(
        priceLine(
          {
            productId: r.productId,
            sizeId: r.sizeId,
            colorId: r.colorId,
            quantity: 1,
          },
          r.product,
          r.size.name,
          r.color.name,
          now,
        ),
      );
      return {
        productId: r.productId,
        productName: r.product.name,
        description: r.product.description,
        categoryId: r.product.categoryId,
        categoryName: r.product.category.name,
        imageUrl: r.product.imageUrls[0] ?? r.product.imageUrl,
        sizeId: r.sizeId,
        sizeName: r.size.name,
        colorId: r.colorId,
        colorName: r.color.name,
        hexCode: r.color.hexCode,
        unitPrice: line.unitPrice,
        discount: line.discount,
        netUnitPrice: line.netUnitPrice,
        available: Math.max(0, r.physicalQuantity - r.reservedQuantity),
      };
    });
    // Clientes minimos (id y nombre) solo para el personal que vende.
    const clients = staff
      ? (
          await this.prisma.client.findMany({
            where: { user: { active: true } },
            select: {
              id: true,
              wholesale: true,
              user: { select: { name: true } },
            },
            orderBy: { id: 'asc' },
            take: MAX_CLIENTS,
          })
        ).map((c) => ({ id: c.id, name: c.user.name, wholesale: c.wholesale }))
      : [];
    const tenant = await this.tenants.findById(tenantContext.requireTenantId());
    const shift = staff
      ? await this.prisma.cashShift.findFirst({
          where: {
            userId: user.id,
            closedAt: null,
            register: { branchId: branch.id },
          },
          select: {
            id: true,
            currency: true,
            openedAt: true,
            register: { select: { id: true, name: true } },
          },
        })
      : null;
    return {
      version: `${branch.id}-${version}-${variants.length}`,
      generatedAt: now,
      tenant: tenant && { id: tenant.id, slug: tenant.slug, name: tenant.name },
      branch,
      branches,
      currency: shift?.currency ?? 'BOB',
      openShift: shift,
      variants,
      clients,
      truncated: rows.length === MAX_VARIANTS,
    };
  }
}
