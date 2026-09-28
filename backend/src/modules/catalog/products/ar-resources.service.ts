import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service.js';
import { CreateArResourceDto } from './dto/ar-resource.dto.js';

const MAX_ACTIVE_RESOURCES = 5;

/**
 * Recursos del probador virtual (RF13). El backend solo guarda la referencia al
 * modelo 3D; la realidad aumentada se ejecuta en el telefono.
 */
@Injectable()
export class ArResourcesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(productId: number) {
    await this.requireProduct(productId);
    return this.prisma.arResource.findMany({
      where: { productId, active: true },
      orderBy: { id: 'asc' },
    });
  }

  async create(productId: number, dto: CreateArResourceDto) {
    await this.requireProduct(productId);
    const active = await this.prisma.arResource.count({
      where: { productId, active: true },
    });
    if (active >= MAX_ACTIVE_RESOURCES)
      throw new ConflictException(
        `A product can have at most ${MAX_ACTIVE_RESOURCES} active AR resources`,
      );
    return this.prisma.arResource.create({
      data: {
        productId,
        url: dto.url,
        format: dto.format,
        type: dto.type,
      },
    });
  }

  /** Se desactiva en lugar de borrar para conservar la trazabilidad del catalogo. */
  async deactivate(productId: number, id: number) {
    const resource = await this.prisma.arResource.findFirst({
      where: { id, productId },
      select: { id: true },
    });
    if (!resource) throw new NotFoundException('AR resource was not found');
    return this.prisma.arResource.update({
      where: { id },
      data: { active: false },
    });
  }

  private async requireProduct(productId: number) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product)
      throw new NotFoundException(`Product ${productId} was not found`);
  }
}
