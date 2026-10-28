import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import { tenantContext } from '../../common/tenant/tenant-context.js';

export interface ResolvedTenant {
  id: number;
  slug: string;
  name: string;
  active: boolean;
}

const CACHE_TTL_MS = 30_000;

/** Resuelve el codigo publico de empresa (slug) con una cache corta en memoria. */
@Injectable()
export class TenantsService {
  private readonly cache = new Map<
    string,
    { tenant: ResolvedTenant | null; expiresAt: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Slug usado por las apps que no envian X-Tenant (compatibilidad con el parcial 1). */
  get defaultSlug(): string {
    return this.config.get<string>('DEFAULT_TENANT_SLUG') ?? 'fashionstore';
  }

  async findBySlug(slug: string): Promise<ResolvedTenant | null> {
    const key = slug.trim().toLowerCase();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.tenant;
    const row = await this.prisma.tenant.findUnique({
      where: { slug: key },
      select: { id: true, slug: true, name: true, status: true },
    });
    const tenant = row
      ? {
          id: row.id,
          slug: row.slug,
          name: row.name,
          active: row.status === 'ACTIVE',
        }
      : null;
    this.cache.set(key, { tenant, expiresAt: Date.now() + CACHE_TTL_MS });
    return tenant;
  }

  async findById(id: number): Promise<ResolvedTenant | null> {
    const key = `#${id}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.tenant;
    const row = await this.prisma.tenant.findUnique({
      where: { id },
      select: { id: true, slug: true, name: true, status: true },
    });
    const tenant = row
      ? {
          id: row.id,
          slug: row.slug,
          name: row.name,
          active: row.status === 'ACTIVE',
        }
      : null;
    this.cache.set(key, { tenant, expiresAt: Date.now() + CACHE_TTL_MS });
    return tenant;
  }

  /** Empresa activa por slug o error HTTP claro. */
  async requireActiveBySlug(slug: string): Promise<ResolvedTenant> {
    const tenant = await this.findBySlug(slug);
    if (!tenant) throw new NotFoundException('Empresa no encontrada');
    if (!tenant.active)
      throw new ForbiddenException({
        code: 'TENANT_INACTIVE',
        message: 'La empresa esta inactiva',
      });
    return tenant;
  }

  /**
   * Ejecuta una tarea interna (jobs de vencimiento, conciliacion) una vez por empresa,
   * con el contexto de esa empresa. Un fallo en una empresa no detiene a las demas.
   */
  async forEachTenant<T>(task: () => Promise<T>): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    let firstError: unknown;
    for (const { id } of tenants) {
      try {
        await tenantContext.runInTenant(id, task);
      } catch (error) {
        firstError ??= error;
      }
    }
    if (firstError) throw firstError;
  }

  invalidate(): void {
    this.cache.clear();
  }
}
